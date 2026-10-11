function canLogin(user, password) {
  if (user.role = "admin") {
    return password === user.password;
  }
  return password === user.password && user.active;
}
module.exports = { canLogin };
