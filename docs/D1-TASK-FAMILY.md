# D1 — Tehtäväperheen valinta (Unikie Contribution Evaluator)

| Kenttä | Arvo |
| --- | --- |
| Päätös | **Jäädytetty MVP-tehtäväperhe: code debugging (`cde-v1`)** |
| Päiväys | 2026-10-12 |
| Tilaaja | Unikie Oy / Knowledge Hub |
| Tekijä | Ville Matilainen |
| Repo | https://github.com/vima20/SkillEvalator |

## Vaihtoehdot (projektisuunnitelma)

1. SQL / tietokantaoptimointi  
2. TypeScript/Node.js PR-katselmointi  
3. Knowledge Hub + RAG  

## Valinta ja perustelu

MVP toteuttaa **code debugging** -perheen (`taskSetId: cde-v1`, 8 tehtävää):

- Objektiivinen mitattavuus: Docker/host grade vs `expected/` + testiskriptit  
- Eristetty sandbox ilman tuotantodataa  
- Kaksi kandidaattipromptia samalla task setillä: `code-debugging-eval` ja `code-debugging-eval-checklist`  
- Sopii 270 h / yhden tekijän raamiin paremmin kuin RAG-referenssiaineisto  

SQL ja KH+RAG siirretään **jatkokehitykseen** (ei MVP-laajuutta).

## Jäädytetty MVP-rajaus

- Yksi tehtäväperhe: **cde-v1**  
- Baseline = neutraali prompt (ei SKILL.md)  
- Candidate = valittu eval-skill (`SKILL.md`)  
- Official: `gpt-4.1-mini`, ≥3 toistoa  
- Comparison official PASS: lift ≥ +5 pp ja candidate score ≥ 0.99 (Benefit USE -floor); soft-pass ≥ 0.8 on vain dry-run / exploratory  
- Dry-run Comparison: INCONCLUSIVE (ei adoption PASS/FAIL)  

## Hyväksyntä

Unikie Product Owner voi vahvistaa tämän D1-kirjauksen katselmoinnissa. Tekninen toteutus noudattaa tätä rajausta kunnes muutosta käsitellään vaihtokauppana (projektisuunnitelman muutosten hallinta).
