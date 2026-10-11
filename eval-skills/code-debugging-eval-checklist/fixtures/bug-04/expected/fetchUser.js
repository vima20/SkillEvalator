async function getUserName(loader) {
  const user = await loader();
  return user.name;
}
module.exports = { getUserName };
