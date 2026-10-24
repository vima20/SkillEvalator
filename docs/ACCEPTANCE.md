# Hyväksyntä — mitä official PASS / USE tarkoittaa

| Kenttä | Arvo |
| --- | --- |
| Repo | SkillEvalator (Unikie Contribution Evaluator MVP) |
| Liittyy | [D1-TASK-FAMILY.md](./D1-TASK-FAMILY.md), [PILOT-CHECKLIST.md](./PILOT-CHECKLIST.md) |

## Lyhyt määrittely

| Tulos | Merkitys | Ei tarkoita |
| --- | --- | --- |
| **Comparison PASS** (official) | Candidate ≥ USE-floor **ja** lift ≥ kynnys samalla task setillä, Docker-gradella, pinneillä kunnossa | “Skill on tuotantovalmis kaikkeen” |
| **Provisional official PASS (1/2)** | Ensimmäinen hyväksytty official tip-pari täyttää gateit, mutta UI/levy näyttää **INCONCLUSIVE · 1/2** kunnes **toinen eri** tip-pari vahvistaa (`officialPassProvisional` poistuu) | Yksittäinen PASS ilman vahvistusta |
| **Benefit USE** | Vahvistetun official **Comparison PASS** jälkeinen adoption-suositus (CSV / Benefit Report) | Smoke-, dry-run- tai provisionaalinen 1/2 -tulos |
| **Comparison FAIL** | Official-ajo ei täytä PASS-kynnystä (tai fail-closed pin rikkoo) | “Skill on hyödytön” |
| **INCONCLUSIVE** | Dry-run / smoke / puuttuva tip / riittämätön toisto | Official adoption |

Dry-run ja `FAKE_PRODUCE=known-good` **eivät** tuota adoption PASS/USE -todistetta.

## Fail-closed (official)

Official Comparison/Benefit hylkää (tai ei nouse PASS:iin), jos luottamusketju katkeaa. Keskeiset pinnit:

- `grade.js` (skill-snapshot) — odotettu grade-hash
- `SKILL.md` / `promptHash` — ehdokkaan prompt ei saa vaihtua ajon jälkeen
- manifest: `evalSkillVersion`, `promptKind`
- `skill-snapshot/job.json` — toistojen sopimus
- live produce attestation (`produceAttested`) — fixture-plantit eivät saa PASS:ia
- Docker grade live -ajossa (host grade vain smokessa)

## Settings `pilotReady`

UI-polku **Settings → Official pilot readiness = Ready** tarkoittaa: preflight OK (API-avain, Docker, worker), smoke-liput pois (`FAKE_PRODUCE`, `ALLOW_HOST_GRADE`), auth kelvollinen, ei orphan `.running.json`. Se **ei** ole vielä PASS/USE — sama blocker-lista estää **official**-jonotuksen New runissa, `POST /api/runs` ja retryssä (**dry-run ok** kun preflight on vihreä). Jos preflight epäonnistuu, API palauttaa 503 ja UI estää **kaiken** jonotuksen (myös dry-run).

## Arkisto (luovutus)

Kun live-pilotti on ajettu, säilytä vähintään:

- `data/results/eval_*` (evaluation + Comparison)
- baseline- ja candidate-`run_*` (`result.json`, status, capture)
- Benefit Report + CSV-vienti kun USE/PASS
- Settingsissä näkyvä **git SHA** (ja dirty-varoitus) arkistolabeliin

**Pilot focus** (`?focus=pilot`):
- **Runs / Benefit** — piilottaa smoke, not_attested, superseded, FAKE_PRODUCE, dry-run ja **pair-blocked** -rivit (sibling tip FAKE / unattested; waiting/unpaired attested voivat jäädä näkyviin)
- **Comparison** — piilottaa dry-run, `evaluation.smoke`, FAKE_PRODUCE / unattested tip-jalalla ja official INCONCLUSIVE (näyttää PASS/FAIL + waiting; superseded on run-tason käsite)
- **Dashboard** — vain official tip -kandidaatit (`produceAttested`); piilottaa pair-blocked tipit; skill-version **#1** / avg ei laske pair-blocked rivejä mukaan

**Clear old runs (7d+)** ei poista `mode: official` -ajoja eikä `evaluation.json`-linkitettyjä jalkoja — muuten `eval_*` katoaisi healissa.

**Clear smoke noise** poistaa heti `evaluation.smoke` -kasvit ja `FAKE_PRODUCE`-ajot (ml. smoke:official ilman `produceAttested`). Attestoitu live official (`produceAttested=true`) säilyy aina; sekapari smoke+live jätetään koskematta.

Official Comparison vaatii `capture.env.grade=docker_script`, `pipeline.grade=docker_script` ja `allowHostGrade=false` (host grade ei ole adoption-todiste).

**Download pilot archive**, **Comparison CSV**, **run CSV** ja **Benefit CSV** (sama evidence-palkki): official PASS/FAIL, ei dry-run / `evaluation.smoke` / FAKE_PRODUCE / **provisional 1/2**; molemmat tip-jalat `produceAttested=true`. **Official-mode** ratkaistaan tip-jaloista (ei pelkästään `comparison.json`), jotta tip-heal ei avaa exportteja väärällä dry-run-merkinnällä. Kun molemmat tip-jalat ovat ladattuina, niiden mode täsmää (eri mode → adoption fail-closed dry-run, vaikka levyllä olisi official). Comparison CSV:n `mode`-sarake ja Benefit CSV:n `comparisonMode` käyttävät samaa tip-ratkaisua (ei pelkkää levyllä olevaa `comparison.json`-modea); web käyttää `comparisonExportContext*` / `benefitExportContextFromPacked` -apureita (yksi pair-browse gate + metadata; molemmat palauttavat `pairBrowse` kun konteksti lasketaan valmiiksi). Run detail SSR ja `GET /api/runs/[runId]` laskevat run CSV -affordancen (`csvExportAllowed`) ja official New-run -handoffin (`preferOfficialHandoff`) samasta evaluation pack -browseta kuin parikontekstin (ei toista levy-lukua renderöinnissä). UI näyttää tip-parin adoption-moden (`pairedDisplayMode` / `listRowAdoptionMode`) vaikka `result.json`-mode olisi eri (run detail, Runs-lista, Dashboard, Benefit-lista/detail, Comparison-lista/detail, pending-näkymät); erosta tooltip (`adoptionModeDesyncTitle`). Jos levyllä oleva `comparison.json`-mode poikkeaa tip-ratkaisusta, Comparison / Benefit / run detail näyttää saman varoituksen kuin arkiston `comparisonJsonMode`. `pairPending=unavailable` näyttää saman Comparison unavailable -calloutin kuin Benefit detail. Archive pakkaa tip-jalat + `evaluation` + `comparison.json` + `MANIFEST.json` (git SHA + baseline/candidate `fakeProduce` / `produceAttested`). `MANIFEST.mode` on tip-jalkojen adoption-mode; jos `comparison.json` poikkeaa, mukana `comparisonJsonMode`; candidate golden -tehtävälaskuri (`candidateTasksGoldenPassed` / `candidateTasksGoldenTotal`) kun tip-candidate scorecard on mukana; Comparison CSV:ssä samat laskurit sekä `candidateDiffRatio` / `candidateGoldenQuality` per tehtävä (Benefit CSV -parity).

Official adoption vaatii **kaksi itsenäistä official PASS** -tip-paria (ensimmäinen näkyy provisionaalisena kunnes toinen eri pari vahvistaa — sama sääntö kuin Benefit USE -lukko).
