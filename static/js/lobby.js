// room_createrはlobby.html内で定義済み
const socket = io();
let room_list = [];

// JSON読み込みとボタン生成
function add_join_room() {
    fetch("/static/data/room_data.json")
        .then(response => response.json())
        .then(data => {
            room_list = Object.values(data);
            const room_hub = document.getElementById("room-hub");
            room_hub.innerHTML = "";

            for (let room of room_list) {
                if (room.join) {
                    const room_btn = document.createElement("button");
                    const room_creater = room.room_creater;
                    const time = room.time;
                    const room_number = room.room_number;
                    room_btn.innerText = `${room_creater} (${time})`;

                    room_btn.onclick = () => {
                        // サーバーに部屋参加を送信
                        socket.emit("get_enter", { "room_creater": room_creater, "room_joiner": room_joiner, "time": time, "room_number": room_number });
                        socket.once("enter_ok", () => {
                            // game.htmlに移動
                            location.href = `/game_join?room_joiner=${room_joiner}&time=${time}&room_number=${room_number}`;
                        });
                    }

                    room_hub.appendChild(room_btn);
                }
            }
        })
        .catch(error => console.error("読み込みエラー:", error));
}

// 部屋作成
function make_room() {
    const time = document.getElementById("time").value;

    socket.emit("make_room", { room_creater: room_creater, time: time });
    location.href = `/wait?room_creater=${room_creater}&time=${time}`;
}

// 初期読み込み
add_join_room();

// サーバから部屋作成イベント受信
socket.on("room_list_make", () => {
    add_join_room();
});