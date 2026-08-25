/**
 * Public deterministic fallback only. The private CSV attachment is imported at runtime
 * and retained in the private Obsidian vault; customer names, identifiers and values are
 * intentionally not committed to this public frontend repository.
 */
export const consumptionSyntheticCsv = [
  "Customer,End User,Sold To,Plan ID,Data Center,Plan Type,FY26-MAR,FY26-APR,FY26-MAY,FY27-JUN,FY27-JUL,FY27-AUG,Total",
  '"Pulse Harbor",Multiple,Multiple,,1,Multiple,$100,$100,$100,$100,$100,$500,$1,000',
  '"Pulse Harbor","Harbor Analytics","Synthetic Sold To",SYN-1001,1,OCI,$100,$100,$100,$100,$100,$500,$1,000',
  '"Cedar Labs","Cedar Search","Synthetic Sold To",SYN-1002,1,OCI,$500,$500,$500,$500,$500,$100,$2,600',
  '"Summit Retail","Summit AI","Synthetic Sold To",SYN-1003,2,OCI,$100,$130,$170,$220,$290,$380,$1,290',
  '"Northstar Media","Northstar Data","Synthetic Sold To",SYN-1004,1,OCI,$500,$450,$390,$320,$240,$160,$2,060',
  '"Blue River Works","Blue River Platform","Synthetic Sold To",SYN-1005,1,OCI,$0,$0,$0,$0,$0,$300,$300',
  '"Maple Systems","Maple Integration","Synthetic Sold To",SYN-1006,1,OCI,$300,$300,$300,$300,$0,$0,$1,200'
].join("\n");
