# Live-pilotti — tarkistuslista

Käytä tätä ennen Unikie-official baseline↔candidate -ajoa. Smoke (`npm run smoke:*`, `FAKE_PRODUCE`) ei korvaa tätä.

## 1. Käynnistys

- [ ] `.env` kopioitu `.env.example`sta; `OPENAI_API_KEY` asetettu
- [ ] `FAKE_PRODUCE` **ei** ole `known-good`
- [ ] `ALLOW_HOST_GRADE` **ei** ole `1`
- [ ] Docker Desktop / daemon käynnissä
- [ ] `start.bat` / `.\start.ps1` (web + worker)
- [ ] Avaa http://127.0.0.1:30001 → **Settings**

## 2. Settings = Ready

- [ ] Official pilot readiness: **Ready** (ei blockereita)
- [ ] Preflight: API key / Docker / Worker OK
- [ ] Smoke harness: FAKE_PRODUCE **Off** ja ALLOW_HOST_GRADE **Off**
- [ ] Auth: pilottiin suositellaan `WEB_AUTH_TOKEN` + `OFFICIAL_REQUIRES_WEB_AUTH=true`
- [ ] Kirjaa **Build git SHA** (ja dirty jos näkyy) arkistoon
- [ ] Queue: ei **Stale running** -rivejä (orphan `.running.json`); jos näkyy → **Refresh** (heals) ja tarkista Ready uudelleen

## 3. Official ajo

- [ ] New run → mode **official**, baseline↔candidate päällä
- [ ] Skill + task set (MVP: `cde-v1`) valittu
- [ ] Repeats ≥ Settingsin *Official min repeats* (oletus 3)
- [ ] Odota kunnes molemmat jalat valmiit → Comparison

## 4. Tuloksen tulkinta

- [ ] UI:ssa **Pilot focus** (`?focus=pilot`): New run / Settings / Nav / unlock säilyttää focuksen; Runs / Benefit / Dashboard piilottaa smoke / not_attested / superseded / dry-run / **pair-blocked** (sibling FAKE tai unattested); Comparison piilottaa dry-run / smoke / FAKE / unattested / official INCONCLUSIVE; Dashboard **#1**-ranking jättää pair-blocked tipit pois (rivit voivat näkyä ilman focusta)
- [ ] Capture: molemmat tip-jalat **Live produce attested** (`produceAttested`)
- [ ] Tarvittaessa Runs tai Comparison → **Clear smoke noise** (poistaa smoke-kasvit diskiltä; ei koske live official -arkistoa)
- [ ] Official Comparison **PASS** vain jos candidate ≥ USE floor ja lift ≥ kynnys ([ACCEPTANCE.md](./ACCEPTANCE.md))
- [ ] Benefit **USE** vain PASS:n jälkeen — ei dry-run / smoke / FAKE_PRODUCE / unattested / pair-blocked
- [ ] Vie CSV (run / Comparison / Benefit) / **Download pilot archive** — sama gate (ei smoke / unattested); UI näyttää 401/409 virheenä (ei raakaa JSON:ia); säilytä zip + `eval_*` + run-kansiot

## 5. Jos Ready = Blocked tai preflight punaista

- **Ready = Blocked** (Settings): korjaa blocker-lista (API-avain, Docker, worker, FAKE_PRODUCE, ALLOW_HOST_GRADE, auth, stale queue), paina **Refresh** (heals orphan `.running.json`; Settings pollaa myös kun Ready=Blocked / jono aktiivinen). Official enqueue + official retry estetty; **dry-run ok** kun preflight on vihreä.
- **Preflight punaista** (API key / Docker / worker): New run ja retry estävät **kaiken** jonotuksen (myös dry-run) — sama kuin API 503. Korjaa preflight ennen uutta ajoa.
