# Live-pilotti — tarkistuslista

Käytä tätä ennen Unikie-official baseline↔candidate -ajoa. Smoke (`npm run smoke:*`, `FAKE_PRODUCE`) ei korvaa tätä.

## 1. Käynnistys

- [ ] `.env` kopioitu `.env.example`sta; `OPENAI_API_KEY` asetettu
- [ ] `FAKE_PRODUCE` **ei** ole `known-good`
- [ ] Docker Desktop / daemon käynnissä
- [ ] `start.bat` / `.\start.ps1` (web + worker)
- [ ] Avaa http://127.0.0.1:30001 → **Settings**

## 2. Settings = Ready

- [ ] Official pilot readiness: **Ready** (ei blockereita)
- [ ] Preflight: API key / Docker / Worker OK
- [ ] Smoke harness: FAKE_PRODUCE **Off**
- [ ] Auth: pilottiin suositellaan `WEB_AUTH_TOKEN` + `OFFICIAL_REQUIRES_WEB_AUTH=true`
- [ ] Kirjaa **Build git SHA** (ja dirty jos näkyy) arkistoon
- [ ] Queue: ei yllättäviä jumiutuneita `running`-rivejä

## 3. Official ajo

- [ ] New run → mode **official**, baseline↔candidate päällä
- [ ] Skill + task set (MVP: `cde-v1`) valittu
- [ ] Repeats ≥ Settingsin *Official min repeats* (oletus 3)
- [ ] Odota kunnes molemmat jalat valmiit → Comparison

## 4. Tuloksen tulkinta

- [ ] UI:ssa **Pilot focus** (`?focus=pilot`): Runs/Benefit piilottaa smoke / superseded / dry-run; Comparison piilottaa dry-run / smoke / FAKE joko jalalla; Dashboard = vain official tip
- [ ] Tarvittaessa Runs → **Clear smoke noise** (poistaa smoke-kasvit diskiltä; ei koske live official -arkistoa)
- [ ] Official Comparison **PASS** vain jos candidate ≥ USE floor ja lift ≥ kynnys ([ACCEPTANCE.md](./ACCEPTANCE.md))
- [ ] Benefit **USE** vain PASS:n jälkeen — ei dry-run / smoke / FAKE_PRODUCE
- [ ] Vie CSV (run / Comparison / Benefit) / **Download pilot archive** — sama gate (ei smoke); säilytä zip + `eval_*` + run-kansiot

## 5. Jos Ready = Blocked

Korjaa Settingsin blocker-lista (API-avain, Docker, worker, FAKE_PRODUCE, auth), paina **Refresh**, älä jonota officialia ennen Readyä.
