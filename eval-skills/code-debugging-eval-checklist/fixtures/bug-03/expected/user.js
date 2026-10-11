function displayName(user) {
  if (!user || !user.profile || !user.profile.name) return "ANONYMOUS";
  return user.profile.name.toUpperCase();
}
module.exports = { displayName };
