# Fennel Health: business case

Fennel Health is a fictional company. All data in this repository is synthetic.

Fennel's board has approved moving its whole product onto Azure and wants a design it can defend to an auditor, a finance director and a technical lead.

## Company

A consumer health app for people in the UK and Isle of Man. Users log sleep, food and glucose readings, connect a wearable and get a weekly insight report. A team of coaches reads flagged trends and messages users.

- **Stage:** Series A, 14 months in market. 38,000 monthly active users, targeting 150,000 within 12 months.
- **Team:** 8 engineers and one platform engineer. 12 coaches and 4 support staff use an internal dashboard from one office in Douglas. NutriLog adds 9 staff.
- **Budget:** production capped at £6,000 a month, dev and test at £800 a month. Cost is reported by team and by environment.
- **Seasonality:** January traffic runs about 4 times a normal month.

## Current state

Nothing is in Azure. There are two separate on-premises estates. Figures are approximate.

### Estate 1: Fennel's product

Two VMs on VMware hosts that Fennel owns, in a rented colocation rack in the Isle of Man. The provider supplies power, cooling and an internet link. The rack has one firewall that supports IPsec site-to-site VPN.

| Piece | Where it runs and how | Today | At 150,000 users |
|---|---|---|---|
| API and consumer web app | Containers on VM 1, deployed by hand | about 150 requests per second at peak | about 600 at the January peak |
| Coach dashboard | A second web app on VM 1, protected by a login only. No network separation from the public product | 16 users | 16 |
| Database | A relational database on VM 2 | 180 GB | about 700 GB |
| Wearable data | Third-party wearables push webhooks to a public endpoint on VM 1, plus a nightly bulk file. A late bulk file goes unnoticed. Senders do not publish stable IP addresses | about 20 webhooks per second on average | about 80 |
| Weekly reports | A job on VM 1 builds one PDF per active user from 22:00 on Sundays and writes it to local disk. Users download by link | 40,000 PDFs, about 16 GB a week, 12 months kept | 150,000 PDFs, about 60 GB a week |
| User uploads | Meal photos and exported data files on local disk on VM 1 | 2 TB | about 5 TB |
| Backup | A nightly database backup to another disk in the same rack. No standby. No restore has been tested | | |

- **Source control and delivery:** code is in GitHub. There is no CI pipeline. Production is deployed by SSH. The only test environment is a shared VM that is often broken.
- **Consumer sign-in:** accounts and passwords are in the application database.
- **Staff identity:** a cloud email and document service. No Entra ID tenant and no Azure subscription. Coaches' laptops are unmanaged.

### Estate 2: NutriLog

Acquired in September. One physical Windows Server 2016 machine in its Douglas office. It is the only domain controller for NutriLog's Active Directory domain and also hosts SQL Server 2016 with a 320 GB nutrition database. The operating system and database engine are at or near the end of Microsoft support. Nine staff sign in with domain accounts and use a desktop application that talks to the database over the office network. The office has a stable fibre link and a firewall that supports IPsec site-to-site VPN.

## Deadlines

- NutriLog's database moves to Azure within 6 months. Staff keep working throughout.
- Fennel's product migration completes within 9 months.
- Change freeze on production from 15 December to 31 January.

## Out of scope

Application code, the mobile app, consumer sign-in, CI/CD beyond what is needed to deploy the IaC, legal sign-off on the GDPR position.

## Requirements

| # | Requirement |
|---|---|
| BR1 | The API is available 99.9% of the month. A planned maintenance window of up to one hour a month is acceptable at night. |
| BR2 | The database loses at most 1 hour of data (RPO) and is restored within 4 hours (RTO) after losing the primary region. |
| BR3 | Health data stays in the UK, including backups and logs. In Azure this means UK regions only. |
| BR4 | Every human access to health data is attributable to a named person and reviewable for 12 months. |
| BR5 | No engineer has standing admin access to production. |
| BR6 | The coach dashboard is reachable only from the coaches' office network and approved devices. |
| BR7 | A user can ask to be erased and is gone from live systems within 30 days. The treatment of backups is stated. |
| BR8 | Weekly reports finish by 06:00 Monday at 150,000 users. |
| BR9 | Wearable webhooks are never dropped. A delay is acceptable, loss is not. |
| BR10 | NutriLog staff keep their existing logins during and after the migration. |
| BR11 | Costs are visible per team and per environment, and an alert fires before the monthly budget is breached. |
| BR12 | Dev, test and production are separate, and production changes are deployed from code, not by hand. |
| BR13 | After the migration, Fennel's API reads NutriLog's nutrition data. That traffic never crosses the public internet. |

## Deliverables

1. Architecture diagram with every Azure resource and its connections.
2. A decision record for each Well-Architected pillar: reliability, security, cost optimisation, operational excellence, performance efficiency.
3. Role and access model: who gets what, at which scope, and how elevation works.
4. Network design: address ranges, subnets, rules, name resolution and control of every route in and out.
5. Recovery plan: what is backed up, how, where, and how restores are proven.
6. Monitoring plan: what is measured, who is alerted and how.
7. Migration plan for both estates, including the live-product cutover and NutriLog's identity and database options.
8. Cost estimate against the budget, with assumptions.
9. Assumptions register: numbered, each with a reason.
10. Infrastructure as code: Bicep first, then Terraform, with an optional AWS comparison.
