from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
import json
import shogi

app = Flask(__name__)
socketio = SocketIO(app)

# ユーザー管理 (username -> sid)
user_sid_dict = {}

# オンライン対戦部屋管理
room_dict = {}


# room_data.jsonに部屋情報を保存する関数
# 将来的にはsfen引数を追加して、初期局面を部屋作成時に編集できる機能を追加したい
def save_room_data(filename, room_creater, time):
    try:
        with open(filename, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {}

    # 新しいIDを連番で付ける
    new_id = str(len(data))

    # 新しい部屋情報を追加
    data[new_id] = {
        "room_number": str(len(data)),
        "room_creater": room_creater,
        "room_joiner": None,
        "time": time,
        "join": True,
        "sfen": "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        "inital_turn": "black",
    }

    # JSONファイルに書き込む
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


# 局面情報(sfen)を更新する関数
def update_sfen(filename, room_number, new_sfen):
    try:
        with open(filename, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {}

    data[room_number]["sfen"] = new_sfen

    # JSONの編集内容を保存
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/login")
def login():
    username = request.args.get("username")
    return render_template("home.html", username=username)


@app.route("/lobby")
def make_room():
    username = request.args.get("username")
    return render_template("lobby.html", username=username)


@app.route("/wait")
def wait():
    room_creater, time, room_number = (
        request.args.get("room_creater"),
        request.args.get("time"),
        request.args.get("room_number"),
    )
    return render_template(
        "wait.html", room_creater=room_creater, time=time, room_number=room_number
    )


# 部屋参加者として参加する時
@app.route("/game_join")
def game_join():
    room_joiner, time, room_number = (
        request.args.get("room_joiner"),
        request.args.get("time"),
        request.args.get("room_number"),  # str型
    )
    with open("static/data/room_data.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    data[room_number]["room_joiner"] = room_joiner
    with open("static/data/room_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

    return render_template(
        "game.html",
        username=room_joiner,
        time=time,
        room_number=room_number,
        turn="white",
    )


# 部屋作成者として参加する時
@app.route("/game_start")
def game_start():
    room_creater = request.args.get("room_creater")
    time = request.args.get("time")
    room_number = request.args.get("room_number")
    print(user_sid_dict, room_creater)
    user_sid_dict.pop(room_creater, None)
    print(user_sid_dict)
    return render_template(
        "game.html",
        username=room_creater,
        time=time,
        room_number=room_number,
        turn="black",
    )


@socketio.on("login")
def login_info(data):
    username = data.get("username")
    emit("login_success", {"username": username})


# 各htmlに接続ごとに発火させて、ユーザー名とsidを紐づける
@socketio.on("register")
def register(data):
    room_creater = data.get("room_creater")
    user_sid_dict[room_creater] = request.sid


@socketio.on("make_room")
def add_room(data):
    room_creater, time = data.get("room_creater"), data.get("time")
    save_room_data("static/data/room_data.json", room_creater, time)
    socketio.emit("room_list_make", {"room_creater": room_creater})


# 部屋参加処理、sfen送信関数
@socketio.on("join_room")
def handle_join_room(data):
    room_number = data.get("room_number")
    join_room(room_number)
    with open("static/data/room_data.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    board_sfen = data[room_number]["sfen"]
    print(board_sfen)
    emit("get_sfen", {"board_sfen": board_sfen}, room=room_number)


# from lobby.html
@socketio.on("get_enter")
def get_enter(data):
    room_creater = data.get("room_creater")
    room_creater_sid = user_sid_dict[room_creater]
    joiner = data.get("my_name")
    time, room_number = data.get("time"), data.get("room_number")
    # room_dataの更新処理
    filename = "static/data/room_data.json"
    try:
        with open(filename, "r", encoding="utf-8") as f:
            room_datas = json.load(f)
            room_datas[str(room_number)]["join"] = False
    except FileNotFoundError:
        room_datas = {}
    # wait.htmlに入室通知を送信
    emit(
        "get_entered",
        {"username": joiner, "time": time, "room_number": room_number},
        to=room_creater_sid,
    )
    emit("enter_ok")


# game.htmlから得た着手が合法手かの判定
@socketio.on("get_move")
def judge_move(data):
    room_number = data.get("room_number")
    board = shogi.Board()
    move = data.get("move")
    board_sfen = data.get("board_sfen")

    board.set_sfen(board_sfen)
    legal_moves_list = [m.usi() for m in board.legal_moves]

    # 合法手の場合の分岐
    # => 対戦相手との盤共有
    if move in legal_moves_list:
        board.push(shogi.Move.from_usi(move))
        new_sfen = board.sfen()
        update_sfen("static/data/room_data.json", room_number, new_sfen)
        emit("update_board", {"board_sfen": new_sfen}, room=room_number)
    else:
        emit("illegal_move", {"msg": f"反則手です: {move}"}, room=room_number)


# 成りを検知した時の反則判定
@socketio.on("judge_promote")
def judge_promote(data):
    room_number = data.get("room_number")
    board = shogi.Board()
    move = data.get("move")
    board_sfen = data.get("board_sfen")

    board.set_sfen(board_sfen)
    legal_moves_list = [m.usi() for m in board.legal_moves]

    if move in legal_moves_list:
        emit("legal_move", room=room_number)
    else:
        emit("illegal_move", {"msg": f"反則手です: {move}"}, room=room_number)


if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=5000, debug=True)
