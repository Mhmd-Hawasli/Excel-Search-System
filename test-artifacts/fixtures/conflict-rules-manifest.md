# Conflict 58-rule fixture coverage manifest (P4.1, 2026-09-09)

Source: V1 `src/lib/conflicts/catalog.ts` (frozen in
`backend/src/ExcelArchive.Domain/Conflicts/ConflictCatalog.cs`).
Per 09 C001–C058: every rule needs one positive + one negative fixture,
plus unmapped/empty differences; directed rules need asymmetric examples
(A→multiple B must not pass as B→multiple A). Fixtures themselves are
built in P4.2 (invalid/missing/similar) and P4.3 (conflicting/directed);
this manifest is the coverage checklist. Status column starts TODO.

Conventions: person key = normalized full name + mother name (V1 query.ts);
contract_pair = primary + secondary code; date range 1940..today with frozen
DB day/timezone in tests; `→` marks the directed from→to sides.

## invalid (11) → P4.2

| Rule | Field | Positive | Negative |
|---|---|---|---|
| national_short | national_id | 8-digit national id flags | 9-digit valid id clean |
| national_long | national_id | 12-digit national id flags | 11-digit valid id clean |
| national_characters | national_id | letters inside national id flags | digits-only valid id clean |
| sham_short | sham_cash | 15-digit sham flags | 16-digit sham clean |
| sham_long | sham_cash | 17-digit sham flags | 16-digit sham clean |
| sham_characters | sham_cash | letters inside sham flags | digits-only 16-digit clean |
| name_mismatch | full_name | full_name not composed of first+father+last parts flags | composed full name clean |
| category_invalid | functional_category | unknown category text flags | known 1–5 category clean |
| date_invalid | date | unparseable date cell flags | valid date clean |
| date_early | date | date before 1940 flags | 1940+ date clean |
| date_future | date | date after today flags | today/past date clean |

## missing (9) → P4.2

| Rule | Field | Positive | Negative |
|---|---|---|---|
| missing_national | national_id | empty national cell flags | filled valid id clean |
| missing_sham | sham_cash | empty sham cell flags | filled sham clean |
| missing_personal | personal_no | empty personal_no flags | filled value clean |
| missing_mother | mother_name | empty mother name flags | filled name clean |
| missing_full | full_name | unmapped/empty full_name flags | mapped filled name clean |
| missing_first | first_name | unmapped/empty first_name flags | mapped filled clean |
| missing_father | father_name | unmapped/empty father_name flags | mapped filled clean |
| missing_last | last_name | unmapped/empty last_name flags | mapped filled clean |
| missing_job | job_title | unmapped/empty job_title flags | mapped filled clean |

Missing-mapped-field differs from absent mapping: both variants required.

## similar (2) → P4.2

| Rule | Field | Positive | Negative |
|---|---|---|---|
| similar_names | full_name | same normalized full name, different mothers flags | same name + same mother clean |
| similar_national | full_name | same normalized full name, different national ids flags | same name + same id clean |

## conflicting existing (14) → P4.3

| Rule | Field | Positive | Negative |
|---|---|---|---|
| duplicate_national | national_id | same valid id twice in one file flags | unique ids clean |
| duplicate_sham | sham_cash | same sham twice in one file flags | unique shams clean |
| duplicate_personal | personal_no | same personal_no twice flags | unique values clean |
| duplicate_contract | contract_code | same primary contract twice flags | unique contracts clean |
| national_people | national_id | one id, two person keys flags | one id one person clean |
| sham_people | sham_cash | one sham, two person keys flags | one sham one person clean |
| personal_people | personal_no | one personal_no, two person keys flags | one value one person clean |
| person_national | national_id | one person key, two national ids flags | one person one id clean |
| person_sham | sham_cash | one person key, two shams flags | one person one sham clean |
| person_contract | contract_code | one person key, two primary contracts flags | one person one contract clean |
| person_personal | personal_no | one person key, two personal_nos flags | one person one value clean |
| person_job | job_title | one person key, two job titles flags | one person one title clean |
| person_category | functional_category | one person key, two categories flags | one person one category clean |
| person_org_level | organizational_level | one person key, two org levels flags | one person one level clean |

## conflicting directed (22) → P4.3 (asymmetric examples required)

| Rule | From → To | Positive | Negative (reverse must NOT match) |
|---|---|---|---|
| pair_national_personal | national_id → personal_no | one id, two personal_nos | two ids one personal_no (belongs to pair_personal_national) |
| pair_national_sham | national_id → sham_cash | one id, two shams | reverse belongs to pair_sham_national |
| pair_national_contract | national_id → contract_pair | one id, two contract pairs | reverse belongs to pair_contract_national |
| pair_national_phone | national_id → phone | one id, two phones | reverse belongs to pair_phone_national |
| pair_personal_national | personal_no → national_id | one personal_no, two ids | reverse belongs to pair_national_personal |
| pair_personal_sham | personal_no → sham_cash | one personal_no, two shams | reverse belongs to pair_sham_personal |
| pair_personal_contract | personal_no → contract_pair | one personal_no, two pairs | reverse belongs to pair_contract_personal |
| pair_personal_phone | personal_no → phone | one personal_no, two phones | reverse belongs to pair_phone_personal |
| pair_sham_national | sham_cash → national_id | one sham, two ids | reverse belongs to pair_national_sham |
| pair_sham_personal | sham_cash → personal_no | one sham, two personal_nos | reverse belongs to pair_personal_sham |
| pair_sham_contract | sham_cash → contract_pair | one sham, two pairs | reverse belongs to pair_contract_sham |
| pair_sham_phone | sham_cash → phone | one sham, two phones | reverse belongs to pair_phone_sham |
| pair_contract_national | contract_pair → national_id | one pair, two ids | reverse belongs to pair_national_contract |
| pair_contract_personal | contract_pair → personal_no | one pair, two personal_nos | reverse belongs to pair_personal_contract |
| pair_contract_sham | contract_pair → sham_cash | one pair, two shams | reverse belongs to pair_sham_contract |
| pair_contract_phone | contract_pair → phone | one pair, two phones | reverse belongs to pair_phone_contract |
| pair_phone_national | phone → national_id | one phone, two ids | reverse belongs to pair_national_phone |
| pair_phone_personal | phone → personal_no | one phone, two personal_nos | reverse belongs to pair_personal_phone |
| pair_phone_sham | phone → sham_cash | one phone, two shams | reverse belongs to pair_sham_phone |
| pair_phone_contract | phone → contract_pair | one phone, two pairs | reverse belongs to pair_national_phone set |
| pair_person_contract | person → contract_pair | one person, two pairs | contract-only legacy rules must not cover secondary |
| pair_person_phone | person → phone | one person, two phones | single phone clean |

## Cross-cutting (C059–C063, P4.4/P4.5)
- Category/field/rule validation matrix (valid + illegal combos).
- Multi-issue record: ignore one rule hides only that rule.
- Hidden-file ignore → 404, no write.
- >200-row export equals list semantics.
- Sort/group/page stability across pages.
