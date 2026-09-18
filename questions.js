// The two Jev question sets. Shared by the page and the relay: with the demo key,
// the relay only forwards these exact questions.

export const TRIAGE = {
  department: {type:"choice", instructions:"Which team should handle this customer message?",
    criteria:{billing:"Payments, charges, refunds, subscriptions",
              technical:"Bugs, outages, integrations, performance",
              sales:"Pricing, upgrades, new accounts, pre-sales questions"}},
  urgent: {type:"noul", instructions:"Does this message express real urgency (degraded service, blocking issue, collective impact)?",
    criteria:{true:"Customer blocked, service unusable or multiple users affected — needs immediate handling",
              false:"Ordinary question or request with no urgent character"}},
  frustration: {type:"score", instructions:"How frustrated is the customer?",
    criteria:["Calm or good-humored customer","Annoyed customer, firm tone","Very angry customer, threatening to leave"]}
};

export const SIZING = {
  complexity: {type:"choice", instructions:"How complex is this request for the assigned agent to resolve?",
    criteria:{simple:"Single-step, well-defined ask",
              standard:"Multi-step but standard procedure",
              complex:"Cross-system investigation, edge case, ambiguous situation"}},
  stakes: {type:"noul", instructions:"Would a wrong or careless answer have serious consequences (money lost, churn, legal or data risk)?",
    criteria:{true:"Serious consequences if the answer is wrong",
              false:"Low-risk, easily corrected if wrong"}}
};

export const AGENT_NAME = {billing:"Billing agent", technical:"Technical agent", sales:"Sales agent", escalation:"Human escalation"};

export const MAX_MESSAGE = 1000;
