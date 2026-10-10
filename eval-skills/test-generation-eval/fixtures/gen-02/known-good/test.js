const assert = require("assert");
const { isPalindrome } = require("./palindrome.js");
assert.strictEqual(isPalindrome("racecar"), true);
assert.strictEqual(isPalindrome("RaceCar"), true);
assert.strictEqual(isPalindrome("A man a plan a canal Panama"), true);
assert.strictEqual(isPalindrome("hello"), false);
assert.strictEqual(isPalindrome(""), true);
assert.strictEqual(isPalindrome(null), false);
console.log("ok");
