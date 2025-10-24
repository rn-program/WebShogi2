// usernameはhome.html内で定義済み
function game() {
    location.href = `/lobby?username=${encodeURIComponent(username)}`;
}