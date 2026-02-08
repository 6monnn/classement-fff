const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".tab-panel");

const urlInput = document.getElementById("urlInput");
const loadBtn = document.getElementById("loadBtn");
const statusEl = document.getElementById("status");
const favoritesSelect = document.getElementById("favoritesSelect");
const favoriteToggleBtn = document.getElementById("favoriteToggleBtn");
const clearFavoritesBtn = document.getElementById("clearFavoritesBtn");
const missingResultsList = document.getElementById("missingResultsList");
const addMissingRowBtn = document.getElementById("addMissingRowBtn");

const standingsBody = document.querySelector("#standingsTable tbody");
const resultsBody = document.querySelector("#resultsTable tbody");
const calendarBody = document.querySelector("#calendarTable tbody");

const resultsTeamFilter = document.getElementById("resultsTeamFilter");
const calendarTeamFilter = document.getElementById("calendarTeamFilter");
const standingsTitle = document.getElementById("standingsTitle");

let allMatches = [];
let manualMatches = [];
let dataCache = null;
let manualRows = [];
let availableTeams = [];
let loadedUrl = "";
const favoritesKey = "classement_favoris";
const defaultFavorites = [
  {
    title: "U13 Niveau A - Phase 1 Poule D",
    url: "https://escaut.fff.fr/competitions?tab=calendar&id=439637&phase=1&poule=4&type=ch",
  },
  {
    title: "U13 Niveau B - Phase 1 Poule F",
    url: "https://escaut.fff.fr/competitions?tab=calendar&id=439638&phase=1&poule=6&type=ch",
  },

  {
    title: "U11 Niveau A - Phase 1 Poule B",
    url: "https://escaut.fff.fr/competitions?tab=calendar&id=439656&phase=1&poule=2&type=ch",
  },
  {
    title: "U11 Niveau B - Phase 1 Poule A",
    url: "https://escaut.fff.fr/competitions?tab=calendar&id=439651&phase=1&poule=1&type=ch",
  },
];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#5d5d5d";
}

function activateTab(tabName) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
  });

  panels.forEach((panel) => {
    const active = panel.id === `tab-${tabName}`;
    panel.classList.toggle("active", active);
  });
}

function wireTabs() {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tab.dataset.tab);
    });
  });
}

function buildQueryFromForm() {
  const url = urlInput.value.trim();
  if (!url) {
    throw new Error("Merci de fournir un lien.");
  }
  return { url };
}

function loadFavorites() {
  const raw = localStorage.getItem(favoritesKey);
  if (!raw) return [...defaultFavorites];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const merged = [...parsed];
      defaultFavorites.forEach((fav) => {
        const exists = merged.some((item) => item?.url === fav.url);
        if (!exists) merged.push(fav);
      });
      return merged;
    }
  } catch (error) {
    return [...defaultFavorites];
  }
  return [...defaultFavorites];
}

function saveFavorites(list) {
  localStorage.setItem(favoritesKey, JSON.stringify(list));
}

function renderFavorites() {
  const favorites = loadFavorites();
  favoritesSelect.innerHTML = "";
  favorites.forEach((fav, index) => {
    const option = document.createElement("option");
    option.value = fav.url;
    option.textContent = fav.title || `Favori ${index + 1}`;
    favoritesSelect.appendChild(option);
  });
  if (!urlInput.value) {
    urlInput.value = defaultFavorites[0]?.url || "";
  }
  favoritesSelect.value = urlInput.value;
  updateFavoriteIconState();
}

function addCurrentFavorite() {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Ajoute d'abord un lien valide.", true);
    return;
  }
  const title = standingsTitle.textContent || "Classement favori";
  const favorites = loadFavorites();
  const exists = favorites.some((fav) => fav.url === url);
  if (!exists) {
    favorites.unshift({ title, url });
    saveFavorites(favorites);
  }
  renderFavorites();
  favoritesSelect.value = url;
  setStatus("Favori ajouté.", false);
}

function clearStoredFavorites() {
  localStorage.removeItem(favoritesKey);
  document.cookie = `${favoritesKey}=; Max-Age=0; path=/`;
  urlInput.value = defaultFavorites[0]?.url || "";
  renderFavorites();
  updateFavoriteIconState();
  setStatus("Favoris supprimés.", false);
}

function updateFavoriteIconState() {
  const url = urlInput.value.trim();
  const hasLoadedStandings = Boolean(standingsTitle.textContent.trim()) && loadedUrl === url;
  const favorites = loadFavorites();
  const exists = favorites.some((fav) => fav.url === url);
  const canUse = hasLoadedStandings && Boolean(url);
  const isFavorite = canUse && exists;
  if (!favoriteToggleBtn) return;
  favoriteToggleBtn.disabled = !canUse;
  favoriteToggleBtn.textContent = isFavorite ? "★" : "☆";
  favoriteToggleBtn.setAttribute(
    "aria-label",
    isFavorite ? "Déjà dans les favoris" : "Ajouter aux favoris"
  );
  favoriteToggleBtn.title = isFavorite ? "Déjà dans les favoris" : "Ajouter aux favoris";
}

function resetManualMatches() {
  manualMatches = [];
  manualRows = [];
}

function buildManualMatch() {
  const homeTeam = missingHome.value;
  const awayTeam = missingAway.value;
  const homeGoals = parseInt(missingHomeGoals.value, 10);
  const awayGoals = parseInt(missingAwayGoals.value, 10);
  const dateValue = missingDate.value;

  if (!homeTeam || !awayTeam) {
    setStatus("Choisis les deux équipes.", true);
    return null;
  }
  if (homeTeam === awayTeam) {
    setStatus("Les équipes doivent être différentes.", true);
    return null;
  }
  if (Number.isNaN(homeGoals) || Number.isNaN(awayGoals)) {
    setStatus("Renseigne les buts domicile et extérieur.", true);
    return null;
  }
  if (!dateValue) {
    setStatus("Choisis une date.", true);
    return null;
  }

  const dateIso = new Date(`${dateValue}T00:00:00`).toISOString();

  return {
    ma_no: `manual-${Date.now()}`,
    date: dateIso,
    time: "",
    home_score: homeGoals,
    away_score: awayGoals,
    home: { short_name: homeTeam },
    away: { short_name: awayTeam },
    status_label: "",
  };
}

function setAvailableTeams(teams) {
  availableTeams = teams.filter((t) => t !== "Toutes");
}

function createTeamCell(name, logoUrl, side, nameClass = "") {
  const span = document.createElement("span");
  span.className = `team-cell ${side || ""}`.trim();

  const text = document.createElement("span");
  text.className = `team-name ${nameClass}`.trim();
  text.textContent = name;

  if (side === "home") {
    span.appendChild(text);
    if (logoUrl) {
      const img = document.createElement("img");
      img.className = "team-logo";
      img.src = logoUrl;
      img.alt = name;
      span.appendChild(img);
    }
  } else {
    if (logoUrl) {
      const img = document.createElement("img");
      img.className = "team-logo";
      img.src = logoUrl;
      img.alt = name;
      span.appendChild(img);
    }
    span.appendChild(text);
  }

  return span;
}

function renderStandings(rows, formMap) {
  standingsBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const teamCell = document.createElement("td");
    const displayName = truncateStandingsName(row.team);
    teamCell.appendChild(createTeamCell(displayName, row.logo, "", "standings-team"));

    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.rank }));
    tr.appendChild(teamCell);
    const pointsCell = Object.assign(document.createElement("td"), {
      textContent: row.points,
    });
    pointsCell.classList.add("points-cell");
    tr.appendChild(pointsCell);
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.played }));
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.wins }));
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.draws }));
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.losses }));
    tr.appendChild(
      Object.assign(document.createElement("td"), { textContent: `${row.gf}:${row.ga}` })
    );
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.gd }));

    const formCell = document.createElement("td");
    formCell.style.textAlign = "left";
    const formItems = formMap?.get(row.team) || ["?", "?", "?", "?", "?", "?"];
    formItems.forEach((item) => {
      const badge = document.createElement("span");
      badge.className = "result-badge form-badge";
      if (item === "?") {
        badge.classList.add("form-unknown");
        badge.textContent = "?";
      } else if (item === "V") {
        badge.classList.add("result-win");
        badge.textContent = "V";
      } else if (item === "N") {
        badge.classList.add("result-draw");
        badge.textContent = "N";
      } else {
        badge.classList.add("result-loss");
        badge.textContent = "D";
      }
      formCell.appendChild(badge);
    });
    tr.appendChild(formCell);

    standingsBody.appendChild(tr);
  });
}

function computeStandingsClient(matches) {
  const table = new Map();

  matches.forEach((match) => {
    const homeScore = match.home_score;
    const awayScore = match.away_score;
    if (typeof homeScore !== "number" || typeof awayScore !== "number") return;

    const homeName = mapTeamName(match.home);
    const awayName = mapTeamName(match.away);
    const homeLogo = mapTeamLogo(match.home);
    const awayLogo = mapTeamLogo(match.away);

    if (!table.has(homeName)) {
      table.set(homeName, {
        team: homeName,
        logo: homeLogo || null,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
      });
    }
    if (!table.has(awayName)) {
      table.set(awayName, {
        team: awayName,
        logo: awayLogo || null,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
      });
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
  });

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

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR");
}

function formatResultDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  return year === currentYear ? `${day}.${month}` : `${day}.${month}.${year}`;
}

function formatDateTime(value, time) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const datePart = `${day}.${month}`;
  if (!datePart) return "";
  if (!time) return datePart;
  const normalized = time.replace("H", ":");
  return `${datePart} - ${normalized}`;
}

function getMatchDate(match) {
  return match.date || match.initial_date || "";
}

function getMatchDateTimeValue(match) {
  const dateValue = getMatchDate(match);
  const base = dateValue ? new Date(dateValue) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  const time = match.time || "";
  const matchTime = time.match(/(\\d{1,2})H(\\d{2})/);
  if (matchTime) {
    base.setHours(parseInt(matchTime[1], 10), parseInt(matchTime[2], 10), 0, 0);
  }
  return base;
}

function mapTeamName(side) {
  return side?.short_name || side?.short_name_ligue || side?.short_name_federation || "";
}

function truncateTeamName(name) {
  const value = name || "";
  if (value.length <= 20) return value;
  return `${value.slice(0, 12)}...`;
}

function truncateStandingsName(name) {
  const value = name || "";
  if (value.length <= 36) return value;
  return `${value.slice(0, 36)}...`;
}

function mapTeamLogo(side) {
  return side?.club?.logo || null;
}

function renderResults(matches) {
  resultsBody.innerHTML = "";
  const filteredTeam = resultsTeamFilter.value || "";
  const resultsTable = document.getElementById("resultsTable");
  resultsTable.classList.toggle("show-result", Boolean(filteredTeam));

  matches.forEach((match) => {
    const home = truncateTeamName(mapTeamName(match.home));
    const away = truncateTeamName(mapTeamName(match.away));
    const homeLogo = mapTeamLogo(match.home);
    const awayLogo = mapTeamLogo(match.away);
    const homeScore = match.home_score;
    const awayScore = match.away_score;
    const hasScore =
      typeof homeScore === "number" && typeof awayScore === "number";
    const score = hasScore ? `${homeScore} - ${awayScore}` : "? - ?";

    let winner = "";
    if (homeScore > awayScore) winner = home;
    if (awayScore > homeScore) winner = away;

    let badgeLetter = "";
    let badgeClass = "";
    if (filteredTeam) {
      if (homeScore === awayScore) {
        badgeLetter = "N";
        badgeClass = "result-draw";
      } else if (winner === filteredTeam) {
        badgeLetter = "V";
        badgeClass = "result-win";
      } else {
        badgeLetter = "D";
        badgeClass = "result-loss";
      }
    }

    const dateValue = getMatchDate(match);
    const displayDate = formatResultDate(dateValue);

    const tr = document.createElement("tr");
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: displayDate }));

    const homeCell = document.createElement("td");
    homeCell.classList.add("home-team");
    const homeTeamCell = createTeamCell(home, homeLogo, "home");
    if (filteredTeam && winner === home) homeTeamCell.classList.add("winner");
    homeCell.appendChild(homeTeamCell);
    tr.appendChild(homeCell);

    const scoreCell = Object.assign(document.createElement("td"), { textContent: score });
    scoreCell.classList.add("score-cell");
    if (match.manual) {
      const manualTag = document.createElement("span");
      manualTag.textContent = " (ajout manuel)";
      manualTag.style.fontSize = "0.8rem";
      manualTag.style.color = "#6b7280";
      scoreCell.appendChild(manualTag);
    }
    tr.appendChild(scoreCell);

    const awayCell = document.createElement("td");
    awayCell.classList.add("away-team");
    const awayTeamCell = createTeamCell(away, awayLogo, "away");
    if (filteredTeam && winner === away) awayTeamCell.classList.add("winner");
    awayCell.appendChild(awayTeamCell);
    tr.appendChild(awayCell);

    const badgeCell = document.createElement("td");
    badgeCell.classList.add("result-col");
    if (filteredTeam && badgeLetter) {
      const badge = document.createElement("span");
      badge.className = `result-badge ${badgeClass}`;
      badge.textContent = badgeLetter;
      badgeCell.appendChild(badge);
    }
    tr.appendChild(badgeCell);

    resultsBody.appendChild(tr);
  });
}

function buildFormMap(matches) {
  const results = matches.filter(
    (match) =>
      typeof match.home_score === "number" && typeof match.away_score === "number"
  );

  const sorted = [...results].sort((a, b) => {
    const dateA = getMatchDateTimeValue(a);
    const dateB = getMatchDateTimeValue(b);
    if (dateA && dateB) return dateB - dateA;
    if (dateA) return -1;
    if (dateB) return 1;
    return 0;
  });

  const formMap = new Map();

  sorted.forEach((match) => {
    const home = mapTeamName(match.home);
    const away = mapTeamName(match.away);
    const homeScore = match.home_score;
    const awayScore = match.away_score;

    const homeResult = homeScore > awayScore ? "V" : homeScore === awayScore ? "N" : "D";
    const awayResult = awayScore > homeScore ? "V" : homeScore === awayScore ? "N" : "D";

    if (!formMap.has(home)) formMap.set(home, []);
    if (!formMap.has(away)) formMap.set(away, []);

    if (formMap.get(home).length < 5) formMap.get(home).push(homeResult);
    if (formMap.get(away).length < 5) formMap.get(away).push(awayResult);
  });

  formMap.forEach((list, key) => {
    const limited = list.slice(0, 5);
    formMap.set(key, ["?", ...limited]);
  });

  return formMap;
}

function renderCalendar(matches) {
  calendarBody.innerHTML = "";

  matches.forEach((match) => {
    const home = truncateTeamName(mapTeamName(match.home));
    const away = truncateTeamName(mapTeamName(match.away));
    const homeLogo = mapTeamLogo(match.home);
    const awayLogo = mapTeamLogo(match.away);
    const dateValue = getMatchDate(match);
    const displayDate = formatDateTime(dateValue, match.time);

    const tr = document.createElement("tr");
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: displayDate }));

    const homeCell = document.createElement("td");
    homeCell.classList.add("home-team");
    homeCell.appendChild(createTeamCell(home, homeLogo, "home"));
    tr.appendChild(homeCell);

    const scoreCell = Object.assign(document.createElement("td"), { textContent: "-" });
    scoreCell.classList.add("score-cell");
    tr.appendChild(scoreCell);

    const awayCell = document.createElement("td");
    awayCell.classList.add("away-team");
    awayCell.appendChild(createTeamCell(away, awayLogo, "away"));
    tr.appendChild(awayCell);

    calendarBody.appendChild(tr);
  });
}

function splitMatches(matches) {
  const results = [];
  const calendar = [];
  matches.forEach((match) => {
    const hasScore =
      typeof match.home_score === "number" && typeof match.away_score === "number";
    const statusLabel = (match.status_label || "").toLowerCase();
    const isPostponed = match.seems_postponed === true || statusLabel.includes("report");
    if (isPostponed) {
      return;
    }
    if (hasScore) {
      results.push(match);
    } else {
      calendar.push(match);
    }
  });
  return { results, calendar };
}

function getMissingResults(calendarMatches) {
  const now = new Date();
  return calendarMatches.filter((match) => {
    const dateValue = getMatchDateTimeValue(match);
    if (!dateValue) return false;
    const isPast = dateValue < now;
    if (!isPast) return false;
    const home = mapTeamName(match.home);
    const away = mapTeamName(match.away);
    return !manualMatches.some(
      (m) =>
        mapTeamName(m.home) === home &&
        mapTeamName(m.away) === away &&
        getMatchDate(m) === getMatchDate(match)
    );
  });
}

function renderMissingResults(matches) {
  if (!missingResultsList) return;
  missingResultsList.innerHTML = "";
  const allRows = [];

  matches.forEach((match) => {
    allRows.push({ type: "missing", match });
  });

  manualMatches.forEach((match) => {
    allRows.push({ type: "manual-existing", match });
  });

  manualRows.forEach((row) => {
    allRows.push({ type: "manual", row });
  });

  if (allRows.length === 0) {
    const emptyRow = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Aucun résultat manquant.";
    emptyRow.appendChild(td);
    missingResultsList.appendChild(emptyRow);
    return;
  }

  allRows.forEach((entry) => {
    if (entry.type === "missing") {
      const match = entry.match;
      const dateValue = getMatchDate(match);
      const displayDate = formatResultDate(dateValue);
      const home = mapTeamName(match.home);
      const away = mapTeamName(match.away);

      const tr = document.createElement("tr");

      tr.appendChild(Object.assign(document.createElement("td"), { textContent: displayDate }));
      tr.appendChild(Object.assign(document.createElement("td"), { textContent: home }));

      const homeInput = document.createElement("input");
      homeInput.type = "number";
      homeInput.min = "0";
      homeInput.className = "score-input";
      const homeTd = document.createElement("td");
      homeTd.appendChild(homeInput);
      tr.appendChild(homeTd);

      tr.appendChild(Object.assign(document.createElement("td"), { textContent: away }));

      const awayInput = document.createElement("input");
      awayInput.type = "number";
      awayInput.min = "0";
      awayInput.className = "score-input";
      const awayTd = document.createElement("td");
      awayTd.appendChild(awayInput);
      tr.appendChild(awayTd);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "Valider";
      addBtn.addEventListener("click", () => {
        const homeGoals = parseInt(homeInput.value, 10);
        const awayGoals = parseInt(awayInput.value, 10);
        if (Number.isNaN(homeGoals) || Number.isNaN(awayGoals)) {
          setStatus("Renseigne les buts pour ce match.", true);
          return;
        }
      const manual = {
        ma_no: `manual-${Date.now()}`,
        date: match.date || match.initial_date || new Date().toISOString(),
        time: match.time || "",
        home_score: homeGoals,
        away_score: awayGoals,
        home: { short_name: home },
        away: { short_name: away },
        status_label: "",
        manual: true,
      };
        manualMatches.push(manual);
        const mergedMatches = [...allMatches, ...manualMatches];
        const formMap = buildFormMap(mergedMatches);
        const standings = computeStandingsClient(mergedMatches);
        renderStandings(standings, formMap);
        applyFilters();
        setStatus("Résultat ajouté.", false);
      });
      const actionTd = document.createElement("td");
      actionTd.appendChild(addBtn);
      tr.appendChild(actionTd);

      missingResultsList.appendChild(tr);
      return;
    }

    const tr = document.createElement("tr");

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    if (entry.type === "manual-existing") {
      const d = getMatchDate(entry.match);
      if (d) dateInput.value = d.slice(0, 10);
    } else if (entry.row?.date) {
      dateInput.value = entry.row.date;
    }
    const dateTd = document.createElement("td");
    dateTd.appendChild(dateInput);
    tr.appendChild(dateTd);

    const homeSelect = document.createElement("select");
    ["", ...availableTeams].forEach((team) => {
      const opt = document.createElement("option");
      opt.value = team;
      opt.textContent = team || "Choisir...";
      homeSelect.appendChild(opt);
    });
    if (entry.type === "manual-existing") {
      homeSelect.value = mapTeamName(entry.match.home);
    } else if (entry.row?.home) {
      homeSelect.value = entry.row.home;
    }
    const homeTd = document.createElement("td");
    homeTd.appendChild(homeSelect);
    tr.appendChild(homeTd);

    const homeInput = document.createElement("input");
    homeInput.type = "number";
    homeInput.min = "0";
    homeInput.className = "score-input";
    if (entry.type === "manual-existing") {
      homeInput.value = entry.match.home_score ?? "";
    } else if (entry.row?.homeGoals !== undefined) {
      homeInput.value = entry.row.homeGoals;
    }
    const homeGoalsTd = document.createElement("td");
    homeGoalsTd.appendChild(homeInput);
    tr.appendChild(homeGoalsTd);

    const awaySelect = document.createElement("select");
    ["", ...availableTeams].forEach((team) => {
      const opt = document.createElement("option");
      opt.value = team;
      opt.textContent = team || "Choisir...";
      awaySelect.appendChild(opt);
    });
    if (entry.type === "manual-existing") {
      awaySelect.value = mapTeamName(entry.match.away);
    } else if (entry.row?.away) {
      awaySelect.value = entry.row.away;
    }
    const awayTd = document.createElement("td");
    awayTd.appendChild(awaySelect);
    tr.appendChild(awayTd);

    const awayInput = document.createElement("input");
    awayInput.type = "number";
    awayInput.min = "0";
    awayInput.className = "score-input";
    if (entry.type === "manual-existing") {
      awayInput.value = entry.match.away_score ?? "";
    } else if (entry.row?.awayGoals !== undefined) {
      awayInput.value = entry.row.awayGoals;
    }
    const awayGoalsTd = document.createElement("td");
    awayGoalsTd.appendChild(awayInput);
    tr.appendChild(awayGoalsTd);

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.textContent = entry.type === "manual-existing" ? "Modifier" : "Ajouter";
    actionBtn.addEventListener("click", () => {
      const homeTeam = homeSelect.value;
      const awayTeam = awaySelect.value;
      const homeGoals = parseInt(homeInput.value, 10);
      const awayGoals = parseInt(awayInput.value, 10);
      const dateValue = dateInput.value;

      if (!homeTeam || !awayTeam) {
        setStatus("Choisis les deux équipes.", true);
        return;
      }
      if (homeTeam === awayTeam) {
        setStatus("Les équipes doivent être différentes.", true);
        return;
      }
      if (Number.isNaN(homeGoals) || Number.isNaN(awayGoals)) {
        setStatus("Renseigne les buts domicile et extérieur.", true);
        return;
      }
      if (!dateValue) {
        setStatus("Choisis une date.", true);
        return;
      }

      const dateIso = new Date(`${dateValue}T00:00:00`).toISOString();
      if (entry.type === "manual-existing") {
        entry.match.date = dateIso;
        entry.match.home_score = homeGoals;
        entry.match.away_score = awayGoals;
        entry.match.home = { short_name: homeTeam };
        entry.match.away = { short_name: awayTeam };
        entry.match.manual = true;
      } else {
        const manual = {
          ma_no: `manual-${Date.now()}`,
          date: dateIso,
          time: "",
          home_score: homeGoals,
          away_score: awayGoals,
          home: { short_name: homeTeam },
          away: { short_name: awayTeam },
          status_label: "",
          manual: true,
        };
        manualMatches.push(manual);
      }

      const mergedMatches = [...allMatches, ...manualMatches];
      const formMap = buildFormMap(mergedMatches);
      const standings = computeStandingsClient(mergedMatches);
      renderStandings(standings, formMap);
      applyFilters();
      setStatus("Match enregistré.", false);
    });
    const actionTd = document.createElement("td");
    actionTd.appendChild(actionBtn);
    tr.appendChild(actionTd);

    missingResultsList.appendChild(tr);
  });
}

function buildTeamOptions(matches) {
  const map = new Map();
  matches.forEach((match) => {
    const homeName = mapTeamName(match.home);
    const awayName = mapTeamName(match.away);
    if (homeName) map.set(homeName, mapTeamLogo(match.home));
    if (awayName) map.set(awayName, mapTeamLogo(match.away));
  });

  const options = Array.from(map.keys()).sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" })
  );

  return ["Toutes", ...options];
}

function populateFilter(select, options) {
  select.innerHTML = "";
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option === "Toutes" ? "" : option;
    opt.textContent = option;
    select.appendChild(opt);
  });
}

function applyFilters() {
  const mergedMatches = [...allMatches, ...manualMatches];
  const { results, calendar } = splitMatches(mergedMatches);
  const missingResults = getMissingResults(calendar);
  const resultsFilter = resultsTeamFilter.value;
  const calendarFilter = calendarTeamFilter.value;

  const filteredResults = resultsFilter
    ? results.filter((match) =>
        mapTeamName(match.home) === resultsFilter || mapTeamName(match.away) === resultsFilter
      )
    : results;

  const filteredCalendar = calendarFilter
    ? calendar.filter((match) =>
        mapTeamName(match.home) === calendarFilter || mapTeamName(match.away) === calendarFilter
      )
    : calendar;

  const resultsWithMissing = [...filteredResults, ...missingResults];
  const sortedResults = [...resultsWithMissing].sort((a, b) => {
    const dateA = getMatchDateTimeValue(a);
    const dateB = getMatchDateTimeValue(b);
    if (dateA && dateB) return dateB - dateA;
    if (dateA) return -1;
    if (dateB) return 1;
    return 0;
  });

  const sortedCalendar = [...filteredCalendar].sort((a, b) => {
    const dateA = getMatchDateTimeValue(a);
    const dateB = getMatchDateTimeValue(b);
    if (dateA && dateB) return dateA - dateB;
    if (dateA) return -1;
    if (dateB) return 1;
    return 0;
  });

  renderResults(sortedResults);
  renderCalendar(sortedCalendar);
  renderMissingResults(missingResults);
}

async function loadStandings(query) {
  const requestedUrl = query?.url?.trim() || "";
  loadedUrl = "";
  updateFavoriteIconState();
  const params = new URLSearchParams(query);
  setStatus("Chargement en cours...");
  standingsBody.innerHTML = "";
  resultsBody.innerHTML = "";
  calendarBody.innerHTML = "";

  const response = await fetch(`/api/standings?${params.toString()}`);
  const data = await response.json();
  dataCache = data;

  if (!response.ok) {
    throw new Error(data.error || "Erreur lors du chargement.");
  }

  allMatches = data.matches || [];
  resetManualMatches();
  const formMap = buildFormMap(allMatches);
  const standings = computeStandingsClient(allMatches);
  renderStandings(standings, formMap);
  standingsTitle.textContent = data.title || "";
  loadedUrl = requestedUrl;
  updateFavoriteIconState();

  const teams = buildTeamOptions(allMatches);
  populateFilter(resultsTeamFilter, teams);
  populateFilter(calendarTeamFilter, teams);
  setAvailableTeams(teams);

  applyFilters();

  setStatus(`Classement mis à jour (${data.source || "OK"}).`);
}

favoriteToggleBtn?.addEventListener("click", () => {
  if (!favoriteToggleBtn || favoriteToggleBtn.disabled) return;
  const url = urlInput.value.trim();
  const exists = loadFavorites().some((fav) => fav.url === url);
  if (exists) {
    setStatus("Ce classement est déjà en favori.", false);
    return;
  }
  addCurrentFavorite();
  updateFavoriteIconState();
});
clearFavoritesBtn?.addEventListener("click", clearStoredFavorites);
loadBtn?.addEventListener("click", async () => {
  try {
    const query = buildQueryFromForm();
    await loadStandings(query);
  } catch (error) {
    setStatus(error.message, true);
  }
});

favoritesSelect.addEventListener("change", async () => {
  urlInput.value = favoritesSelect.value || "";
  updateFavoriteIconState();
  if (!urlInput.value) return;
  try {
    const query = buildQueryFromForm();
    await loadStandings(query);
  } catch (error) {
    setStatus(error.message, true);
  }
});

urlInput.addEventListener("input", updateFavoriteIconState);

addMissingRowBtn?.addEventListener("click", () => {
  manualRows.push({ date: "", home: "", away: "" });
  applyFilters();
});

resultsTeamFilter.addEventListener("change", applyFilters);
calendarTeamFilter.addEventListener("change", applyFilters);

renderFavorites();
wireTabs();

if (urlInput.value) {
  loadStandings({ url: urlInput.value }).catch(() => {});
}
