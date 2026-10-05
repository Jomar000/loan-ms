# Loan Management Back-office User Manual

## Para saan ang manual na ito

Gabay ito para sa araw-araw na paggamit ng back-office: pag-set up ng loan
products, pagrehistro ng borrower, paggawa at pagproseso ng loan, collections,
renewals, reports, at administration. Ang makikita mong menu ay depende sa
iyong role at sa mga feature na naka-enable sa organization.

## Roles at access

| Role             | Pangunahing access                                                                      |
| ---------------- | --------------------------------------------------------------------------------------- |
| Owner            | Lahat ng administrative at operational feature, kasama ang users at service principals. |
| Admin            | Operational at settings access; tingnan lamang ang user-management details.             |
| Cashier          | Payment-related loan workflow.                                                          |
| Collector        | Assigned collections lamang.                                                            |
| Viewer / Auditor | Read-only loan, collection, overdue, at report records.                                 |
| Member           | Role-specific landing page at mga feature na ibinigay ng organization.                  |

Kung wala ang **Settings**, **Loan Products**, o **Users** sa sidebar, humingi
ng Owner ng tamang role o access. Huwag gumamit ng account ng ibang tao.

## Recommended first-time setup

Gawin ang mga ito bago tumanggap ng unang loan application:

1. Sa **Settings**, i-review ang default payment frequency, borrower tags/risk
   policy, at iba pang future-operation defaults.
2. Gumawa at mag-activate ng kahit isang **Calculation formula profile**.
3. Gumawa ng isa o higit pang **Loan Products** na gumagamit ng active formula
   profile.
4. Kung ginagamit ang Company Fund, ihanda ang opening or injected funds bago
   mag-release ng loans.
5. I-set up ang mga user at ang kanilang roles.

## Formula profiles at loan products

### Bakit lumalabas ang “Create and activate a formula profile in Settings first.”?

Hindi ito validation error sa pangalan o halaga ng loan product. Ibig sabihin
nito ay walang **active** formula profile na puwedeng piliin. Ang Create Loan
Product form ay sadyang nagpapakita lamang ng profiles na Active.

### Saan makikita ang Formula Profile?

1. Mag-sign in bilang **Owner** o **Admin**.
2. Sa sidebar, buksan ang **Settings**.
3. Sa pinakataas ng System Settings page, hanapin ang card na **Calculation
   formula profiles**.
4. Piliin ang **New profile**.

Kung empty ang card, normal na wala pang row actions. Nandoon pa rin ang
**New profile** button sa upper-right. Sa maliit na screen, i-scroll nang
pahalang ang table upang makita ang action buttons pagkatapos may profile na.

### Paano gumawa at mag-activate ng Formula Profile

1. Sa **Calculation formula profiles**, piliin ang **New profile**.
2. May editable **Default example: 60-day daily loan** bilang reference:
   20% flat interest, 60 payments, at renewal pagkatapos ng 30 completed
   payments. Piliin ang **Use default example** kung gusto mong ibalik ang
   sample values.
3. Palitan ang sample profile name at values para tumugma sa inyong policy;
   huwag i-save ang sample name kung hindi ito aktuwal na produkto.
4. Piliin ang interest method:
    - **Flat percentage**: ilagay ang interest rate.
    - **Fixed amount**: ilagay ang fixed interest amount.
5. Kumpletuhin ang term days, payment frequency, installment count, rounding,
   partial-credit policy, at renewal rules. Piliin ang renewal-principal option
   lamang kung pinapayagan ng policy ninyo ang pagbabago nito sa renewal.
6. Sa **Minimum payments before renewal**, maglagay ng 0 hanggang sa number ng
   **Installment count**. Halimbawa: kung 60 ang installments, valid ang 30;
   hindi valid ang 61. Kapag binawasan ang installment count, awtomatikong
   ia-adjust ng form ang renewal minimum kung kailangan.
7. Maglagay ng sample principal at total paid, pagkatapos piliin ang **Run
   preview**. I-check ang interest, total payable, installment, at renewal
   figures bago i-save.
8. Piliin ang **Save immutable version**.
9. Sa bagong row sa table, piliin ang **Activate**. Ito ang magse-set sa profile
   bilang default at active para sa future loan products.
10. Bumalik sa **Loan Products** at buksan ulit ang Create Loan Product form.
    Lalabas na ang profile sa **Formula profile** list.

Mahalaga: hindi ine-edit ang saved formula. Kapag may kailangang baguhin,
piliin ang **New version**, i-review ang bagong values, i-save, at i-activate
ang bagong version. Ang existing products at loans ay mananatili sa kanilang
original snapshot. Ang **Retire** ay para ihinto ang paggamit ng active profile
sa future products.

### Paano gumawa ng Loan Product

1. Buksan ang **Loan Products** sa sidebar.
2. Piliin ang **Create loan product**.
3. Ilagay ang product name.
4. Piliin ang active Formula profile.
5. Itakda ang minimum at maximum principal amount at ang iba pang required
   product terms.
6. I-review ang values, pagkatapos piliin ang **Create product**.

Ang napiling formula version ay kino-copy bilang snapshot sa product at sa
mga loan na gagamit nito. Kaya gumawa ng bagong formula version, sa halip na
umasa na mababago ang computation ng dating loans.

## Daily loan workflow

### 1. Borrowers

Gamitin ang **Borrowers** upang magrehistro, maghanap, at mag-maintain ng
borrower record.

1. Buksan ang **Borrowers** at piliin ang create action.
2. Ilagay ang **Full name**, contact number, at required address details nang
   tama. Hindi na kailangan ang hiwa-hiwalay na first, middle, at last name,
   birth date, o emergency-contact information.
3. I-review ang borrower tags at risk information ayon sa policy ng kumpanya.
4. I-save at gamitin ang borrower record sa paggawa ng loan quote.

Gamitin ang search bago mag-create para maiwasan ang duplicate borrower
records. Huwag maglagay ng sensitibong data sa free-text fields kung hindi
kinakailangan para sa operasyon.

### 2. Loan quote, approval, at records

Sa **Loans**, puwedeng mag-list/filter ng loans, gumawa ng quote, magsumite
para sa approval, at tumingin sa loan details.

1. Piliin ang create/quote action sa **Loans**.
2. Piliin ang borrower at loan product.
3. Ilagay ang principal, release date, at first payment date.
4. I-review ang calculated schedule at amount bago isumite.
5. I-submit ang quote para sa required approval flow.
6. Buksan ang loan details upang tingnan ang status, schedule, at history.

Ang date, product, at formula profile ay may epekto sa calculation. I-check
ang mga ito bago magsumite; huwag mag-double-click o mag-submit nang paulit-ulit
kung mabagal ang connection.

### 3. Payments at Collections

Gamitin ang **Collections** upang suriin ang expected at received collections
batay sa Manila business date. Ang **Cashier** ay may payment-oriented workflow;
ang **Collector** ay makakakita lamang ng assigned collections.

1. Buksan ang **Collections** o ang payment screen na available sa role mo.
2. Hanapin ang loan/collection record at i-verify ang borrower at amount.
3. I-record ang natanggap na payment gamit ang tamang payment details.
4. I-confirm ang result at i-check ang updated loan/collection record.

Para sa discrepancy, huwag gumawa ng duplicate payment. I-check muna ang loan
details, collection record, at Activity Logs; i-escalate ang correction ayon sa
company process.

### 4. Renewals

Sa **Renewals**, makikita ang renewal records at puwedeng simulan ang renewal
workflow para sa eligible loan.

1. Hanapin at buksan ang loan/renewal record.
2. I-review ang completed installments, outstanding or settlement balance, at
   renewal policy ng formula profile.
3. I-review ang cash release at settlement figures.
4. I-submit lamang kapag tama ang selected loan at renewal terms.

Ang eligibility at calculation ay nakadepende sa immutable formula profile ng
loan. Kung iba ang kailangan para sa susunod na produkto, gumawa at mag-activate
ng bagong formula version para sa mga future loans.

### 5. Overdue

Gamitin ang **Overdue** para makita ang mga loan na lampas sa due date.

1. Buksan ang **Overdue**.
2. I-filter o hanapin ang record kung kailangan.
3. Buksan ang loan at collection details bago mag-follow up o mag-record ng
   payment.

Huwag i-assume na nawawala ang overdue status agad pagkatapos mag-record ng
payment; i-refresh at i-check ang authoritative record.

## Financial administration

### Company Fund

Ang **Company Fund** ay para sa fund setup, fund injection/withdrawal, manual
transactions, at ledger-derived balances.

1. Buksan ang **Company Fund**.
2. Piliin ang tamang fund action: setup, inject, withdraw, o manual
   transaction.
3. I-verify ang amount, business date, at supporting reference bago i-post.
4. I-review ang resulting balance at ledger entry.

Ang ledger history ay dapat tratuhing permanent operational record. Iwasan ang
pag-post ng duplicate transaction; kung may mali, sundin ang approved reversal
or correction process sa halip na burahin ang history.

### Reports

Gamitin ang **Reports** para sa collections, releases, renewals, portfolio, at
financial summary.

1. Buksan ang **Reports**.
2. Piliin ang date range. Ang reporting dates ay gumagamit ng Asia/Manila
   business date.
3. I-review ang summary, daily/monthly ledger trends, portfolio by status,
   collection totals/count, at renewal totals/settlements.
4. I-export o i-share lamang ayon sa data-access policy ng kumpanya.

Interpretation note: ang cash-in/out, principal at interest collections,
released/refunded amounts, expenses/write-offs, at period net earnings ay para
sa napiling period. Ang current portfolio at overdue balances ay current-state
snapshots at hindi historical balance “as of” the selected date range.

## Administration at control features

### Users and roles

Gamitin ang **Users** para makita ang staff access. Owner lang ang maaaring
magpalit ng `member` at `admin` role at mag-enable/disable ng sign-in; ang Admin
ay review-only sa user management.

1. I-confirm ang identity at required access ng staff bago magbago ng role.
2. Magbigay lamang ng minimum access na kailangan sa trabaho.
3. I-disable ang sign-in kapag wala nang authorized access ang user.
4. I-review ang Activity Logs pagkatapos ng important access change.

### Settings

Sa **Settings**, nakalagay ang Formula Profiles at future-operation defaults:
payment frequency, borrower tags/risk policy, at iba pang system defaults.

I-review ang effect ng bawat pagbabago bago i-save. Ang defaults ay para sa
future selections; hindi ito awtomatikong magpapalit ng snapshots ng existing
products o loans.

### Activity Logs

Gamitin ang **Activity Logs** para maghanap at mag-audit ng recorded activity.

1. Maghanap gamit ang event ID, IP address, o other available fields.
2. Mag-filter ayon sa date, module, action, actor, o record type.
3. Buksan ang details para makita ang safe, human-readable record changes.

Gamitin ito sa investigation at verification; huwag mag-copy o mag-share ng
sensitive details sa hindi authorized na channel.

### Service Principals (kung naka-enable)

Ang **Service Principals** ay para sa programmatic/API access ng approved
systems. Owner o Admin lamang ang dapat mag-manage nito.

Ibigay ang credential sa approved system lamang. I-save ang raw key sa secure
secret manager kapag ipinakita; ituring itong unrecoverable at huwag ilagay sa
chat, email, screenshots, o documents.

### Workspace (kung naka-enable)

Ang **Workspace** ay para sa approved file upload/download. I-upload lamang
ang files na kailangan sa business process at i-check ang filename at access
audience bago mag-share.

## Mabilis na troubleshooting

| Nakikita mo                                                                 | Gagawin                                                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walang Formula profile options sa Create Loan Product                       | Settings → Calculation formula profiles → New profile → save → Activate. Bumalik sa Loan Products at subukan muli.                                             |
| “Minimum renewal completed installments must not exceed installment count.” | Bawasan ang Minimum payments before renewal hanggang kapantay o mas mababa sa Installment count. Halimbawa: 30 maximum kapag 30 ang installments.              |
| Walang Settings o New profile button                                        | Owner/Admin access ang kailangan; magpa-check sa Owner.                                                                                                        |
| Walang action sa Formula Profile                                            | Kung empty ang table, gumawa muna ng profile. Kapag may row na, gamitin ang direct buttons na New version, Activate, o Retire; walang hiwalay na Options menu. |
| Formula profile ay hindi ma-edit                                            | Expected ito. Piliin ang New version, saka i-save at i-activate ang bagong version.                                                                            |
| Hindi tugma ang report total sa portfolio balance                           | Ihiwalay ang date-range transactions mula sa current-state portfolio/overdue snapshot.                                                                         |
| Mukhang duplicate ang payment o fund entry                                  | Huwag mag-post ulit. Hanapin ang record at Activity Logs, pagkatapos sundin ang correction process.                                                            |

## Support information to collect

Bago mag-report ng issue, ihanda ang role mo, organization, exact page,
borrower/loan/reference ID kung naaangkop, Manila date and time, steps na
ginawa, at screenshot na walang unnecessary sensitive data. Huwag mag-share ng
passwords, raw API keys, o full personal information sa support request.
