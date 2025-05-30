const users = [];

// Usuario se une al chat
function userJoin(id, username) {
  const user = { id, username };

  users.push(user);

  return user;
}

// Obtener usuario actual
function getCurrentUser(id) {
  return users.find(user => user.id === id);
}

// Usuario abandona el chat
function userLeave(id) {
  const index = users.findIndex(user => user.id === id);

  if (index !== -1) {
    return users.splice(index, 1)[0];
  }
}

// Obtener todos los usuarios
function getAllUsers() {
  return users;
}

module.exports = {
  userJoin,
  getCurrentUser,
  userLeave,
  getAllUsers
}; 