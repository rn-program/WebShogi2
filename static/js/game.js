// --- Socket.IO の初期化 ---
// room_number, initial_turn は game.html で定義済み
const socket = io();

// 選択中の駒と選択中の持ち駒
let selectedPiece = null;
let selectedHand = null;

// --- 駒種類と画像ファイル名のマッピング ---
const pieceImgMap = {
    "P": "black_pawn.png", "+P": "black_prom_pawn.png",
    "L": "black_lance.png", "+L": "black_prom_lance.png",
    "N": "black_knight.png", "+N": "black_prom_knight.png",
    "S": "black_silver.png", "+S": "black_prom_silver.png",
    "G": "black_gold.png", "K": "black_king.png",
    "R": "black_rook.png", "+R": "black_prom_rook.png",
    "B": "black_bishop.png", "+B": "black_prom_bishop.png",
    "p": "white_pawn.png", "+p": "white_prom_pawn.png",
    "l": "white_lance.png", "+l": "white_prom_lance.png",
    "n": "white_knight.png", "+n": "white_prom_knight.png",
    "s": "white_silver.png", "+s": "white_prom_silver.png",
    "g": "white_gold.png", "k": "white_king.png",
    "r": "white_rook.png", "+r": "white_prom_rook.png",
    "b": "white_bishop.png", "+b": "white_prom_bishop.png"
};

// --- SFEN文字列を盤面配列に変換 ---
// 例: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
function sfenToArray(sfen) {
    const rows = sfen.split(" ")[0].split("/");
    return rows.map(r => {
        const res = [];
        for (let i = 0; i < r.length; i++) {
            const c = r[i];
            if (/[1-9]/.test(c)) {
                // 数字の場合は空マスをその数だけ追加
                for (let j = 0; j < parseInt(c); j++) res.push("");
            } else if (c === "+") {
                // 成り駒の場合は次の文字を+付きで追加
                i++;
                res.push("+" + r[i]);
            } else {
                res.push(c);
            }
        }
        return res;
    });
}

// --- SFEN文字列から手番を取得 ---
function getTurnFromSfen(sfen) {
    return sfen.split(" ")[1] === "b" ? "black" : "white";
}

// --- SFEN文字列から持ち駒を取得 ---
function getHandsFromSfen(sfen) {
    const parts = sfen.trim().split(" ");
    if (parts.length < 3) return { black: [], white: [] };
    const h = parts[2];
    if (h === "-") return { black: [], white: [] };

    const black = [], white = [];
    const regex = /(\d*[a-zA-Z])/g;
    const matches = h.match(regex) || [];
    for (const m of matches) {
        const cnt = parseInt(m) || 1;  // 数字がなければ 1
        const piece = m.replace(/\d+/g, "");
        const isBlack = piece === piece.toUpperCase();
        for (let i = 0; i < cnt; i++) isBlack ? black.push(piece) : white.push(piece);
    }
    return { black, white };
}

// --- 駒名から画像パスを返す ---
function sfenToImg(piece) {
    return "/static/image/" + (pieceImgMap[piece] || "missing.png");
}

// --- 盤面座標 → USI形式文字列に変換 ---
// fx, fy: 移動元, tx, ty: 移動先
function coordsToSfenMove(fx, fy, tx, ty) {
    const fromRank = 9 - fy;
    const fromFile = String.fromCharCode(97 + fx); // 'a'～'i'
    const toRank = 9 - ty;
    const toFile = String.fromCharCode(97 + tx);
    return `${fromRank}${fromFile}${toRank}${toFile}`;
}

// --- 盤面描画 ---
// board_sfen: SFEN形式の盤面
function display_board(board_sfen) {
    const board_container = document.getElementById("board-container");

    // 後手スタートの場合は盤面を反転
    if (initial_turn == "white") {
        board_container.style.transform = "rotate(180deg)";
    }

    const board_array = sfenToArray(board_sfen);
    const turn = getTurnFromSfen(board_sfen);
    const shogi_board = document.getElementById("shogi-board");
    shogi_board.innerHTML = ""; // 既存の盤面をクリア

    // --- マスと駒を生成 ---
    for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
            const cell = document.createElement("button");
            const piece = board_array[i][j];

            // 駒があれば画像を追加
            if (piece) {
                const img = document.createElement("img");
                img.src = sfenToImg(piece);
                img.onerror = () => img.src = "/static/image/missing.png";
                cell.appendChild(img);
            }

            // --- マスクリック処理 ---
            cell.addEventListener("click", () => {
                const blackTurn = turn === "black";

                // --- 持ち駒打ち ---
                if (selectedHand && !piece) {
                    const move = selectedHand.piece.toUpperCase() + "*" + (9 - j) + String.fromCharCode(97 + i);
                    // 持ち駒着手の合法判定
                    socket.emit("get_move", { move: move, board_sfen: board_sfen, room_number: room_number });
                    selectedHand = null;
                    display_board(board_sfen);
                    return;
                }

                // --- 駒選択 ---
                if (!selectedPiece && piece && ((blackTurn && piece === piece.toUpperCase()) || (!blackTurn && piece === piece.toLowerCase()))) {
                    selectedPiece = { row: i, col: j };
                    cell.style.border = "2px solid red"; // 選択中マーク
                    return;
                }

                // --- 駒選択解除 ---
                if (selectedPiece && selectedPiece.row === i && selectedPiece.col === j) {
                    selectedPiece = null;
                    cell.style.border = "1px solid #654321";
                    return;
                }

                // --- 駒移動 ---
                if (selectedPiece) {
                    const moveFrom = selectedPiece;
                    const moveTo = { row: i, col: j };
                    const movingPiece = board_array[moveFrom.row][moveFrom.col];

                    // 成り判定
                    const promotable = ["P", "L", "N", "S", "B", "R"];
                    const inZone = blackTurn ? moveTo.row <= 2 || moveFrom.row <= 2 : moveTo.row >= 6 || moveFrom.row >= 6;
                    const canPromote = promotable.includes(movingPiece.toUpperCase()) && inZone;
                    const cellTo = shogi_board.children[moveTo.row * 9 + moveTo.col];

                    if (canPromote) {
                        const moveStrNormal = coordsToSfenMove(moveFrom.row, moveFrom.col, moveTo.row, moveTo.col);
                        const moveStrPromote = moveStrNormal + "+";

                        // サーバーに成り判定リクエスト
                        socket.emit("judge_promote", { move: moveStrPromote, board_sfen: board_sfen, room_number: room_number });

                        // 合法手なら成り選択ボタン表示
                        socket.on("legal_move", () => {
                            const promoteDiv = document.createElement("div");
                            promoteDiv.className = "promote-btns";

                            const promoteBtn = document.createElement("button");
                            promoteBtn.innerText = "成";
                            const noPromoteBtn = document.createElement("button");
                            noPromoteBtn.innerText = "不";

                            promoteDiv.appendChild(promoteBtn);
                            promoteDiv.appendChild(noPromoteBtn);
                            cellTo.innerHTML = "";
                            cellTo.appendChild(promoteDiv);

                            promoteBtn.onclick = () => {
                                socket.emit("get_move", { move: moveStrPromote, board_sfen: board_sfen, room_number: room_number });
                                selectedPiece = null;
                            };
                            noPromoteBtn.onclick = () => {
                                socket.emit("get_move", { move: moveStrNormal, board_sfen: board_sfen, room_number: room_number });
                                selectedPiece = null;
                            };
                        });
                    } else { // 駒が成れないときの処理
                        const moveStr = coordsToSfenMove(moveFrom.row, moveFrom.col, moveTo.row, moveTo.col);
                        socket.emit("get_move", { move: moveStr, board_sfen: board_sfen, room_number: room_number });
                        selectedPiece = null;
                    }
                }
            });

            shogi_board.appendChild(cell);
        }
    }

    // --- 持ち駒描画 ---
    const hands = getHandsFromSfen(board_sfen);

    function addHand(containerId, hand, isBlack) {
        const container = document.getElementById(containerId);
        container.innerHTML = "";
        const order = ["P", "L", "N", "S", "G", "B", "R"];
        const grouped = {};
        for (const p of hand) grouped[p.toUpperCase()] = (grouped[p.toUpperCase()] || 0) + 1;

        for (const piece of order) {
            if (!grouped[piece]) continue;

            const div = document.createElement("div");
            div.className = "hand-piece";

            const img = document.createElement("img");
            img.src = sfenToImg(isBlack ? piece : piece.toLowerCase());
            img.onerror = () => img.src = "/static/image/missing.png";
            div.appendChild(img);

            if (grouped[piece] > 1) {
                const span = document.createElement("span");
                span.innerText = grouped[piece];
                div.appendChild(span);
            }

            // --- 持ち駒クリック ---
            div.addEventListener("click", () => {
                const turnBlack = board_sfen.split(" ")[1] === "b";
                if (isBlack !== turnBlack) return;

                if (selectedHand && selectedHand.piece === piece && selectedHand.isBlack === isBlack) {
                    selectedHand = null;
                    div.style.border = "1px solid #654321";
                    return;
                }

                document.querySelectorAll(`#${containerId} .hand-piece`).forEach(d => d.style.border = "1px solid #654321");
                selectedHand = { piece: piece, isBlack: isBlack };
                div.style.border = "2px solid red";
            });

            container.appendChild(div);
        }
    }

    addHand("black-captures", hands.black, true);
    addHand("white-captures", hands.white, false);
}

// --- 初期盤面取得 ---
function getInitialSfen(room_number) {
    return new Promise((resolve, reject) => {
        socket.emit("join_room", { room_number: room_number });
        socket.once("get_sfen", data => {
            if (data && data.board_sfen) resolve(data.board_sfen);
            else reject("board_sfen missing");
        });
    });
}

// ---局面描画 ---
(async () => {
    try {
        const board_sfen = await getInitialSfen(room_number);
        display_board(board_sfen);

        // サーバーからの盤面更新を受信
        socket.on("update_board", data => {
            display_board(data.board_sfen);
            selectedPiece = null;
            selectedHand = null;
        });
        socket.on("illegal_move", () => {
            // display_board(board_sfen);
            selectedPiece = null;
            cell.style.border = "1px solid #654321";
            selectedHand = null;
        });
    } catch (err) {
        console.error(err);
    }
})();