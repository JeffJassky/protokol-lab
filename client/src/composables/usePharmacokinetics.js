// Sub-Q Bateman PK — rises over absorption phase (ka ~ 6h) then decays at
// elimination rate. Matches the `subq` profile in SettingsPage.
export function subqDose(t, mg, halfLifeDays) {
  if (t < 0) return 0;
  const ka = Math.LN2 / 0.25;
  const ke = Math.LN2 / halfLifeDays;
  if (Math.abs(ka - ke) < 1e-6) return mg * ke * t * Math.exp(-ke * t);
  return mg * (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
}
