@echo off
chcp 65001 > nul
echo ======================================================
echo  手書き数字認識 ＆ データ収集ツールを起動しています...
echo ======================================================
echo.
echo ブラウザが自動的に開きます。
echo 終了するときはこの黒い画面を閉じてください。
echo.

start "" "http://localhost:8000/collect_single.html"
python -m http.server 8000
