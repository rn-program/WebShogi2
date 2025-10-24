const socket = io();

// ユーザー名とsidの登録
socket.emit("register", { "room_creater": room_creater });

// 部屋参加通知、対局開始ページ遷移
socket.on("get_entered", (data) => {
    const time = data.time;
    const room_number = data.room_number;
    location.href = `/game_start?username=${room_creater}&time=${time}&room_number=${room_number}`;
});