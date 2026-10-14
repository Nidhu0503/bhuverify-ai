# Adding a state

This release supports Bihar (`BR`) only. It contains an official-service directory and document-comparison rules, not a government registry API. It does not retrieve CAPTCHA-protected records, authenticate land documents, submit mutation applications, or establish title.

`src/lib/states.ts` exports `BIHAR` and `getState(code)`. Unsupported codes return `undefined`; never silently use Bihar rules for another state. A new adapter must define terminology, available jurisdictions, public official-service links and workflow guidance, with a review date and source notes.

Before enabling a new state:

1. Verify the state revenue and registration services from primary official sources. Record whether each service requires login, CAPTCHA, payment or an authorised integration.
2. Define the parcel identity: state, district, revenue jurisdiction, village, survey/version and local parcel identifiers. Do not equate two plot numbers outside their jurisdiction.
3. Review state-specific mutation, correction, inheritance, partition, land-classification and record-copy workflows with appropriate local expertise. A document checklist is not a universal statement of legal requirements.
4. Add language/terminology examples and evaluate extraction against consented or synthetic documents. Historical scripts and handwriting need explicit manual-review fallback.
5. Add documented measurement conversions. This engine converts acres, decimals (one hundredth of an acre), hectares, square metres and square feet. It deliberately does not apply one katha/bigha/dhur conversion to all locations.
6. Add tests for ambiguous identifiers, multi-plot documents, missing dates, joint ownership, historical records, different surveys and unavailable official data.
7. Separate an approved official connector from uploaded evidence. Record retrieval time, service, reference and response provenance; never set `officialVerification` from a user upload or an AI response.
8. Enable the state only after its rules, wording, security and service availability have been reviewed. State-specific rule dispatch must precede non-Bihar production support.

## Bihar sources

The [Bihar Bhumi official directory](https://biharbhumi.bihar.gov.in/Biharbhumi/default/) was inspected on 10 September 2026. It links the services below. Availability and record coverage can change; the application opens these sites for the user and makes no background government query.

| Service | Official link | Purpose / limitations |
| --- | --- | --- |
| Jamabandi | https://emutation.bihar.gov.in/biharBhumireport/ViewJamabandi | Revenue-entry lookup using district, anchal, mauza and search identifiers; CAPTCHA. |
| Mutation status | https://emutation.bihar.gov.in/biharBhumireport/MutationStatusNew | Application status with jurisdiction and case/deed/plot reference; CAPTCHA. |
| Bhu-Abhilekh | https://bhuabhilekh.bihar.gov.in/ | Land-document service with public login; available record coverage varies. |
| Parimarjan Plus | https://parimarjanplus.bihar.gov.in/ParimarjanNew/userDashboard.aspx | Jamabandi correction or digitisation workflow; distinct from mutation. |
| BhuNaksha | https://bhunaksha.bihar.gov.in/10/index.jsp | Cadastral and survey map service; select the appropriate survey/version. |
| Mortgage information | https://land.bihar.gov.in/Encumbrances/guestsearch.aspx | Link confirmed on Bihar Bhumi; target timed out during review. No completeness guarantee. |
| Bhu-Lagaan | https://www.bhulagan.bihar.gov.in/ | Link confirmed on Bihar Bhumi; target timed out during review. Payment does not prove title. |
| Registration / certified copies | https://enibandhan.bihar.gov.in/citizens/login | Citizen login reached through the online certified-copy link on https://nibandhan.bihar.gov.in/; verify applicable coverage and requirements. |

## Rule boundaries

`analyzeCase()` is deterministic. Gemini extracts candidate text fields; it does not decide legal ownership. Every finding points to document IDs, and the UI can display the source quote for the relevant field. A matching area/name is a limited textual comparison. Missing evidence always creates an `unknown` item. Every analysis keeps `officialVerification: 'not_performed'` and includes an explicit official-check item.

For the distinction between mutation and title, see paragraph 16 of the Supreme Court’s [Karam Singh v. Amarjit Singh judgment, 15 October 2025](https://api.sci.gov.in/supremecourt/2022/32133/32133_2022_14_1502_65047_Judgement_15-Oct-2025.pdf). It explains the fiscal purpose of mutation entries and that they do not confer title. This is a design boundary, not advice on the merits of an individual property dispute.

The current schema cannot represent a full title chain, multiple parties and capacities, overlapping survey systems, transferred shares, or complete directional geometry. Such matters need manual review and schema extensions before automated conclusions. Original files should never be overwritten when an extracted value is corrected.
