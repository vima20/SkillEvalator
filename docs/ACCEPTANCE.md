# Hyväksyntä — mitä official PASS / USE tarkoittaa

| Kenttä | Arvo |
| --- | --- |
| Repo | SkillEvalator (Unikie Contribution Evaluator MVP) |
| Liittyy | [D1-TASK-FAMILY.md](./D1-TASK-FAMILY.md), [PILOT-CHECKLIST.md](./PILOT-CHECKLIST.md) |

## Lyhyt määrittely

| Tulos | Merkitys | Ei tarkoita |
| --- | --- | --- |
| **Comparison PASS** (official) | Candidate ≥ USE-floor **ja** lift ≥ kynnys samalla task setillä, Docker-gradella, pinneillä kunnossa | “Skill on tuotantovalmis kaikkeen” |
| **Benefit USE** | PASS:n jälkeinen adoption-suositus (CSV / Benefit Report) | Smoke- tai dry-run -tulos |
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

UI-polku **Settings → Official pilot readiness = Ready** tarkoittaa: preflight OK (API-avain, Docker, worker), smoke-liput pois, auth-konfiguraatio kelvollinen. Se **ei** ole vielä PASS/USE — se on ehto live official -jonotukselle.

## Arkisto (luovutus)

Kun live-pilotti on ajettu, säilytä vähintään:

- `data/results/eval_*` (evaluation + Comparison)
- baseline- ja candidate-`run_*` (`result.json`, status, capture)
- Benefit Report + CSV-vienti kun USE/PASS
- Settingsissä näkyvä **git SHA** (ja dirty-varoitus) arkistolabeliin
