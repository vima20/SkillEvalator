function formatMoney(cents, currency = "USD") {
  return String(cents) + " " + currency;
}
module.exports = { formatMoney };
