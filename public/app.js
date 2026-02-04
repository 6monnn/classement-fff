const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".tab-panel");

const urlInput = document.getElementById("urlInput");
const loadBtn = document.getElementById("loadBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusEl = document.getElementById("status");
const favoritesSelect = document.getElementById("favoritesSelect");
const favoriteBtn = document.getElementById("favoriteBtn");

const standingsBody = document.querySelector("#standingsTable tbody");
const resultsBody = document.querySelector("#resultsTable tbody");
const calendarBody = document.querySelector("#calendarTable tbody");

const resultsTeamFilter = document.getElementById("resultsTeamFilter");
const calendarTeamFilter = document.getElementById("calendarTeamFilter");
const standingsTitle = document.getElementById("standingsTitle");

let lastQuery = null;
let allMatches = [];
const favoritesKey = "classement_favoris";
const defaultFavorite = {
  title: "U13 Niveau A - Phase 1 Poule D",
  url: "https://escaut.fff.fr/competitions?tab=calendar&id=439637&phase=1&poule=4&type=ch",
};

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
  if (!raw) return [defaultFavorite];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (error) {
    return [defaultFavorite];
  }
  return [defaultFavorite];
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
  if (!urlInput.value && favorites.length > 0) {
    urlInput.value = favorites[0].url;
  }
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
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.played }));
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.wins }));
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.draws }));
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.losses }));
    tr.appendChild(
      Object.assign(document.createElement("td"), { textContent: `${row.gf}:${row.ga}` })
    );
    tr.appendChild(Object.assign(document.createElement("td"), { textContent: row.gd }));
    const pointsCell = Object.assign(document.createElement("td"), {
      textContent: row.points,
    });
    pointsCell.classList.add("points-cell");
    tr.appendChild(pointsCell);

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
    const score = `${homeScore} - ${awayScore}`;

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
  const { results, calendar } = splitMatches(allMatches);
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

  const sortedResults = [...filteredResults].sort((a, b) => {
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
}

async function loadStandings(query) {
  const params = new URLSearchParams(query);
  setStatus("Chargement en cours...");
  standingsBody.innerHTML = "";
  resultsBody.innerHTML = "";
  calendarBody.innerHTML = "";

  const response = await fetch(`/api/standings?${params.toString()}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Erreur lors du chargement.");
  }

  allMatches = data.matches || [];
  const formMap = buildFormMap(allMatches);
  renderStandings(data.standings || [], formMap);
  standingsTitle.textContent = data.title || "";

  const teams = buildTeamOptions(allMatches);
  populateFilter(resultsTeamFilter, teams);
  populateFilter(calendarTeamFilter, teams);

  applyFilters();

  lastQuery = query;
  refreshBtn.disabled = false;
  setStatus(`Classement mis à jour (${data.source || "OK"}).`);
}

loadBtn.addEventListener("click", async () => {
  try {
    const query = buildQueryFromForm();
    await loadStandings(query);
  } catch (error) {
    setStatus(error.message, true);
  }
});

refreshBtn.addEventListener("click", async () => {
  if (!lastQuery) return;
  try {
    await loadStandings(lastQuery);
  } catch (error) {
    setStatus(error.message, true);
  }
});

favoriteBtn.addEventListener("click", addCurrentFavorite);

favoritesSelect.addEventListener("change", () => {
  urlInput.value = favoritesSelect.value || "";
});

resultsTeamFilter.addEventListener("change", applyFilters);
calendarTeamFilter.addEventListener("change", applyFilters);

renderFavorites();
wireTabs();
