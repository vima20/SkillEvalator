# Eval-skill-paketti — minimi ja tuonti

Tuonti: **New run → Find / Receive** (GitHub tai paikallinen `.zip`).

### Agent Skill verkosta (vain `SKILL.md`)

Jos repossa tai zipissä on kansio **`SKILL.md`** ilman `fixtures/manifest.json`, import **käärii** skillin automaattisesti:

- tehtäväperhe **`cde-v1`** (code debugging, 8 tehtävää — sama kuin MVP [D1](./D1-TASK-FAMILY.md));
- `fixtures/manifest.json` + `scripts/grade.js` kopioitu paikallisesta `eval-skills/code-debugging-eval`;
- `.import.json` merkitään `wrappedFromAgentSkill: true`.

**Rajoitus:** promptti arvioidaan **debug-tehtävillä**, ei skillin omalla tehtävämaailmalla. Oma perhe vaatii täyden eval-paketin (alla). GitHub-URL voi osoittaa skill-kansioon tai `blob/.../SKILL.md` (import käyttää parent-kansiota).

Täysi eval-paketti (oma tehtäväsetti) — edelleen suositeltu tuotantotarkkuuteen:

## Kaksi rakennetta

### A) Jaettu tehtäväsetti (`taskSetDir`)

Sama tehtäväperhe, eri promptit — kuten repossa `code-debugging-eval` + `eval-skills/tasksets/cde-v1/`.

```
oma-skill/
├── SKILL.md
├── scripts/
│   └── grade.js
└── fixtures/
    └── manifest.json          ← ei task-kansioita täällä
```

`manifest.json` viittaa jaettuun settiin:

```json
{
  "taskSetId": "cde-v1",
  "taskSetDir": "cde-v1",
  "githubUrl": "https://github.com/owner/repo/tree/main/oma-skill",
  "commit": "abcdef1234567890abcdef1234567890abcdef12",
  "license": "MIT",
  "dependencies": ["node"],
  "taskIds": ["bug-01", "bug-02", "bug-03", "bug-04", "bug-05", "bug-06", "bug-07", "bug-08"],
  "dryRunIds": ["bug-01", "bug-03", "bug-08"],
  "targetFile": {
    "bug-01": "sum.js",
    "bug-02": "auth.js"
  }
}
```

**`targetFile`**: jokaiselle `taskIds`-riville yksi tiedostonimi (ei polkuja) — mallin tuottama korjattava tiedosto.

**Tuonti ja `taskSetDir`:**

- Import kopioi vain skill-kansion (`oma-skill/`), ei koko repoa.
- Jaettu `tasksets/cde-v1` pitää löytyä joko:
  - tästä SkillEvalator-asennuksesta (`eval-skills/tasksets/cde-v1`), **tai**
  - zip-paketissa erillisenä polkuna, joka asennetaan samalle koneelle (käytännössä helpoin: **self-contained B** uudelle perheelle), **tai**
  - importtaa koko repo, jossa on sekä skill että `eval-skills/tasksets/...` ja import URL osoittaa repoon (asennus etsii `fixtures/manifest.json` — useita skillejä kerralla mahdollista).

MVP:ssä valmis jaettu perhe: [D1-TASK-FAMILY.md](./D1-TASK-FAMILY.md) (`cde-v1`).

### B) Itse sisältävä skill (kaikki fixturet skillin alla)

Kuten `eval-skills/test-generation-eval/`:

```
oma-skill/
├── SKILL.md
├── scripts/
│   └── grade.js
└── fixtures/
    ├── manifest.json
    ├── gen-01/
    │   ├── input/
    │   ├── expected/          ← golden-vertailu (diff)
    │   ├── known-good/        ← smoke / harness (valinnainen)
    │   ├── known-bad/
    │   ├── subject/           ← tge-tyyli
    │   ├── subject-bad/
    │   └── tests/             ← cde-tyyli: testit ajetaan artefaktin päällä
    └── gen-02/
        └── ...
```

Esimerkki `manifest.json` (ei `taskSetDir`):

```json
{
  "taskSetId": "oma-perhe-v1",
  "githubUrl": "https://github.com/owner/repo/tree/main/oma-skill",
  "license": "MIT",
  "dependencies": ["node"],
  "taskIds": ["gen-01", "gen-02", "gen-03"],
  "dryRunIds": ["gen-01", "gen-02", "gen-03"],
  "targetFile": {
    "gen-01": "test.js",
    "gen-02": "test.js",
    "gen-03": "test.js"
  }
}
```

**Code-debugging-tyylin** tehtäväkansio (`cde-v1/bug-01/`):

| Kansio | Tarkoitus |
| --- | --- |
| `input/` | Lähtöartefakti (buginen) |
| `expected/` | Golden-tulos (diff-pisteytys) |
| `tests/` | `grade.js` kopioi nämä + mallin tiedoston ja ajaa |
| `known-good/` / `known-bad/` | `npm run smoke:skills` -harness |

Katso: `eval-skills/tasksets/cde-v1/bug-01/` ja `eval-skills/code-debugging-eval/scripts/grade.js`.

## `manifest.json` — kentät

| Kenttä | Pakollinen | Huomio |
| --- | --- | --- |
| `taskSetId` | kyllä | Lyhyt id (esim. `cde-v1`, `tge-v1`) |
| `taskSetDir` | ei | Jos set, fixturet `tasksets/<taskSetDir>/` |
| `githubUrl` | kyllä | **https** canonical tree-URL skill-kansioon |
| `commit` | suositeltu | 7–40 hex; Capture / official |
| `license` | kyllä | Esim. `MIT` |
| `dependencies` | kyllä | Esim. `["node"]` |
| `taskIds` | kyllä | Kaikki official-tehtävät |
| `dryRunIds` | kyllä | Alijoukko halvempaan dry-run-ajoon |
| `targetFile` | kyllä | `taskId → tiedostonimi` jokaiselle tehtävälle |

Skeema: `packages/core/src/schema.ts` → `SkillManifestSchema`.

## `SKILL.md`

- Skill-kansion juuressa, ei tyhjä.
- Candidate-ajossa malli saa tämän sisällön; baseline ajaa ilman skilliä (neutraali prompt).

## `scripts/grade.js`

- Worker ajaa Dockerissa skillin `scripts/grade.js` (ei pelkkää host-gradea live-pilotissa).
- Ympäristö: `TASK_DIR`, `ARTIFACT_PATH`, `TARGET_FILE` (ja mahd. skillikohtaiset).
- Exit `0` = tehtävä läpi, muuten fail.
- Kopioi olemassa olevasta skillistä ja muokkaa — eri tehtäväperheet vaativat eri logiikkaa (`code-debugging-eval` vs `test-generation-eval`).

Official Comparison pinnaa snapshotissa `grade.js`-hashin; älä vaihda gradea kesken adoption-ketjun odottamatta uutta ajoa.

## Tuonti käytännössä

### GitHub

1. Pushaa skill (tai koko `eval-skills/`-puu) GitHubiin.
2. New run → **Find / Receive** → URL esim.  
   `https://github.com/owner/repo/tree/main/eval-skills/oma-skill`
3. **Import from GitHub** → skill ilmestyy valikkoon (`data/imported-skills/imp_*`).
4. Valitse skill, **dry-run**, baseline↔candidate, aja.

Rajoitukset: vain **github.com**, zip enintään **80 MB**, enintään **30** skilliä per import-haku.

### Paikallinen zip

1. Pakkaa kansio, jossa on vähintään yksi `…/fixtures/manifest.json` (esim. koko `oma-skill/`).
2. New run → valitse `.zip` → import.
3. Sama offline/USB-demo kuin README kuvaa.

Windows: zip voi olla tavallinen zip; import käyttää `tar`-pohjaista purkua (sama kuin skill-import testeissä).

## Tarkistus ennen official-ajoa

1. `npm run smoke:skills` — jos skill on repossa `eval-skills/<id>/`, smoke löytää sen automaattisesti.
2. UI **Settings → Ready** (Docker, API key, ei `FAKE_PRODUCE`).
3. Dry-run: kaikki `dryRunIds` järkevät pisteet.
4. Official: [PILOT-CHECKLIST.md](./PILOT-CHECKLIST.md) + [ACCEPTANCE.md](./ACCEPTANCE.md).

## Yleiset virheet

| Oire | Syy |
| --- | --- |
| Import: ei skillejä | Ei `fixtures/manifest.json` polkua |
| `SKILL.md empty` | Puuttuva tai tyhjä tiedosto |
| `shared task set not found` | `taskSetDir` mutta ei `tasksets/<id>` paikallisesti |
| `targetFile` / manifest parse error | Puuttuva avain tai väärä tiedostonimi |
| Grade aina fail | `grade.js` ei sovi fixture-rakenteeseen |
| Official INCONCLUSIVE | Smoke, dry-run, parity, golden-tehtävä, 2× PASS, jne. — ei skill-import-ongelma |

## Referenssit tässä repossa

| Skill | Rakenne |
| --- | --- |
| [eval-skills/code-debugging-eval](../eval-skills/code-debugging-eval/) | `taskSetDir: cde-v1` |
| [eval-skills/code-debugging-eval-checklist](../eval-skills/code-debugging-eval-checklist/) | Sama setti, eri `SKILL.md` |
| [eval-skills/test-generation-eval](../eval-skills/test-generation-eval/) | Kaikki fixturet skillin alla |
| [eval-skills/tasksets/cde-v1](../eval-skills/tasksets/cde-v1/) | Jaettu debug-perhe |

Nopein tapa aloittaa toisessa repossa: **fork** SkillEvalator, lisää `eval-skills/oma-skill/`, kopioi `manifest.json` + `grade.js` mallista, päivitä `SKILL.md`, import GitHub-URL skill-kansioon.
