function isPalindrome(s) {
  if (typeof s !== "string") return false;
  const t = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return t === t.split("").reverse().join("");
}
module.exports = { isPalindrome };
