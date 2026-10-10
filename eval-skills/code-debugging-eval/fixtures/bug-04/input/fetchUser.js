function getUserName(loader) {
  const user = loader();
  return user.name;
}
module.exports = { getUserName };
