import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DOFA_BASE = "https://api-dofa.fff.fr/api";
const DEFAULT_CG_NO = 89; // District Escaut

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseLevelInput(input) {
  const raw = normalizeSpaces(input).toUpperCase();
  const compact = raw.replace(/\s+/g, "");

  let match = compact.match(/^(U\d{2})([A-Z])$/);
  if (match) {
    return { age: match[1], letter: match[2] };
  }

  match = compact.match(/^(U\d{2})NIVEAU([A-Z])$/);
  if (match) {
    return { age: match[1], letter: match[2] };
  }

  match = raw.match(/(U\d{2})\s*(?:NIVEAU\s*)?([A-Z])\b/i);
  if (match) {
    return { age: match[1].toUpperCase(), letter: match[2].toUpperCase() };
  }

  return null;
}

function parsePouleInput(input) {
  const raw = normalizeSpaces(input).toUpperCase();
  if (/^\d+$/.test(raw)) {
    return { type: "number", value: parseInt(raw, 10) };
  }
  const letterMatch = raw.match(/([A-Z])/);
  if (letterMatch) {
    return { type: "letter", value: letterMatch[1] };
  }
  return null;
}

function getTeamName(side) {
  if (!side) return "Équipe inconnue";
  return (
    side.short_name ||
    side.short_name_ligue ||
    side.short_name_federation ||
    side.name ||
    (side.club && side.club.name) ||
    "Équipe inconnue"
  );
}

function getTeamLogo(side) {
  return (side && side.club && side.club.logo) || null;
}

function buildTitleFromMatches(matches) {
  if (!matches || matches.length === 0) return "";
  const sample = matches[0];
  const competitionName = sample.competition?.name || "Compétition";
  const phaseNumber = sample.phase?.number;
  const pouleName = sample.poule?.name || "";
  const pouleLabel = pouleName ? pouleName.replace("POULE ", "Poule ") : "";
  const phaseLabel = phaseNumber ? `Phase ${phaseNumber}` : "";
  return `${competitionName} - ${phaseLabel}${pouleLabel ? ` ${pouleLabel}` : ""}`.trim();
}

function computeStandings(matches) {
  const table = new Map();

  for (const match of matches) {
    const homeScore = match.home_score;
    const awayScore = match.away_score;
    if (typeof homeScore !== "number" || typeof awayScore !== "number") {
      continue;
    }

    const homeName = getTeamName(match.home);
    const awayName = getTeamName(match.away);
    const homeLogo = getTeamLogo(match.home);
    const awayLogo = getTeamLogo(match.away);

    if (!table.has(homeName)) {
      table.set(homeName, initRow(homeName, homeLogo));
    }
    if (!table.has(awayName)) {
      table.set(awayName, initRow(awayName, awayLogo));
    }

    const homeRow = table.get(homeName);
    const awayRow = table.get(awayName);

    if (!homeRow.logo && homeLogo) homeRow.logo = homeLogo;
    if (!awayRow.logo && awayLogo) awayRow.logo = awayLogo;

    homeRow.played += 1;
    awayRow.played += 1;

    homeRow.gf += homeScore;
    homeRow.ga += awayScore;
    awayRow.gf += awayScore;
    awayRow.ga += homeScore;

    if (homeScore > awayScore) {
      homeRow.wins += 1;
      homeRow.points += 3;
      awayRow.losses += 1;
    } else if (homeScore < awayScore) {
      awayRow.wins += 1;
      awayRow.points += 3;
      homeRow.losses += 1;
    } else {
      homeRow.draws += 1;
      awayRow.draws += 1;
      homeRow.points += 1;
      awayRow.points += 1;
    }
  }

  const rows = Array.from(table.values()).map((row) => ({
    ...row,
    gd: row.gf - row.ga,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.localeCompare(b.team, "fr", { sensitivity: "base" });
  });

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return rows;
}

function initRow(team, logo) {
  return {
    team,
    logo: logo || null,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erreur API (${response.status}): ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function fetchMatches(competitionId, phaseNumber, pouleNumber) {
  const url = `${DOFA_BASE}/compets/${competitionId}/phases/${phaseNumber}/poules/${pouleNumber}/matchs`;
  const data = await fetchJson(url);
  return data["hydra:member"] || [];
}

async function fetchCompetitionsLight(cgNo) {
  const url = new URL(`${DOFA_BASE}/compets`);
  url.searchParams.set("cg_no", cgNo);
  url.searchParams.set("competition_type", "CH");
  url.searchParams.append("groups[]", "compet_light");

  const data = await fetchJson(url);
  if (Array.isArray(data) && Array.isArray(data[3])) {
    return data[3];
  }
  if (data && Array.isArray(data["hydra:member"])) {
    return data["hydra:member"];
  }
  return [];
}

function scoreCompetitionName(name, age, letter) {
  const upper = name.toUpperCase();
  let score = 0;
  const regex = new RegExp(`${age}\\s*(?:NIVEAU\\s*)?${letter}\\b`, "i");
  if (regex.test(upper)) score += 2;
  if (upper.includes("NIVEAU")) score += 1;
  if (upper.includes(`${age} NIVEAU ${letter}`)) score += 2;
  return score;
}

async function findCompetitionByLevel(levelInput, cgNo) {
  const parsed = parseLevelInput(levelInput);
  if (!parsed) {
    throw new Error("Le niveau doit ressembler à 'U13A' ou 'U13 Niveau A'.");
  }

  const { age, letter } = parsed;
  const competitions = await fetchCompetitionsLight(cgNo);

  const candidates = competitions
    .map((comp) => ({
      comp,
      score: scoreCompetitionName(comp.name || "", age, letter),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.comp.name.localeCompare(b.comp.name, "fr"));

  if (candidates.length === 0) {
    throw new Error(`Aucune compétition trouvée pour ${age} Niveau ${letter}.`);
  }

  return candidates[0].comp;
}

function resolvePhaseAndPoule(competition, phaseNumber, pouleInput) {
  const phase = (competition.phases || []).find((p) => Number(p.number) === Number(phaseNumber));
  if (!phase) {
    throw new Error(`Phase ${phaseNumber} introuvable pour cette compétition.`);
  }

  const pouleParsed = parsePouleInput(pouleInput);
  if (!pouleParsed) {
    throw new Error("La poule doit être un numéro ou une lettre (ex: D).");
  }

  let group = null;
  if (pouleParsed.type === "number") {
    group = (phase.groups || []).find((g) => Number(g.stage_number) === pouleParsed.value);
  } else {
    const target = `POULE ${pouleParsed.value}`;
    group = (phase.groups || []).find((g) => (g.name || "").toUpperCase().includes(target));
  }

  if (!group) {
    throw new Error(`Poule ${pouleInput} introuvable pour la phase ${phaseNumber}.`);
  }

  return { phase, group };
}

app.get("/api/standings", async (req, res) => {
  try {
    const { url, level, phase, poule, cg_no } = req.query;

    let competitionId;
    let phaseNumber;
    let pouleNumber;
    let competitionInfo = null;
    let sourceLabel = "";

    if (url) {
      const parsedUrl = new URL(url);
      competitionId = parsedUrl.searchParams.get("id");
      phaseNumber = parsedUrl.searchParams.get("phase");
      pouleNumber = parsedUrl.searchParams.get("poule");
      sourceLabel = "URL compétition";

      if (!competitionId || !phaseNumber || !pouleNumber) {
        return res.status(400).json({
          error: "Le lien doit contenir id, phase et poule.",
        });
      }
    } else if (level && phase && poule) {
      const cgNo = cg_no ? Number(cg_no) : DEFAULT_CG_NO;
      const competition = await findCompetitionByLevel(level, cgNo);
      const resolved = resolvePhaseAndPoule(competition, Number(phase), poule);

      competitionId = competition.cp_no;
      phaseNumber = resolved.phase.number;
      pouleNumber = resolved.group.stage_number;
      competitionInfo = competition;
      sourceLabel = `Recherche ${level}`;
    } else {
      return res.status(400).json({
        error: "Fournis soit une URL, soit niveau + phase + poule.",
      });
    }

    const matches = await fetchMatches(competitionId, phaseNumber, pouleNumber);
    const standings = computeStandings(matches);
    const title = buildTitleFromMatches(matches);

    res.json({
      source: sourceLabel,
      competitionId: Number(competitionId),
      phase: Number(phaseNumber),
      poule: Number(pouleNumber),
      competition: competitionInfo,
      standings,
      title,
      matches,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Erreur serveur" });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
