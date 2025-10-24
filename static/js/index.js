let user_data = []
fetch("/static/data/user_data.json")
    .then(response => response.json())
    .then(data => {
        user_data = data;
    })
    .catch(error => console.error(error));

const socket = io();

function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    if (Object.keys(user_data).includes(username)) {
        if (user_data[username] == password) {
            socket.emit("login", { username: username })
        }
        else {
            document.getElementById("alert").textContent = "ユーザー名またはパスワードが間違っています"
        }
    }
    else {
        document.getElementById("alert").textContent = "ユーザー名またはパスワードが間違っています"
    }
}

socket.on("login_success", data => {
    location.href = `/login?username=${encodeURIComponent(data.username)}`;
});