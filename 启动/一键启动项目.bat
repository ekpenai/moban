@echo off
title MOBAN 设计编辑器 - 启动中心
color 0b

echo ======================================================
echo          MOBAN Online Design Editor
echo             一键启动全栈开发环境
echo ======================================================
echo.

:: 检查目录
set BASE_DIR=%~dp0..

:: 1. 启动后端服务
echo [步骤 1/3] 正在启动核心后端 (NestJS)...
start "MOBAN - 核心后端" cmd /k "cd /d %BASE_DIR%\server && echo 正在通过 NestJS 启动后端服务... && npm run start:dev"

:: 等待一小会儿确保后端初始化
timeout /t 2 >nul

:: 2. 启动前端界面
echo [步骤 2/3] 正在启动极速前端 (Vite)...
start "MOBAN - 极速前端" cmd /k "cd /d %BASE_DIR%\web && echo 正在通过 Vite 启动前端界面... && npm run dev"

timeout /t 1 >nul

:: 3. 启动渲染 Worker（导出高分辨率图必须运行）
echo [步骤 3/3] 正在启动渲染 Worker（Sharp 队列）...
start "MOBAN - 渲染 Worker" cmd /k "cd /d %BASE_DIR%\worker && echo 正在启动 Bull 渲染 Worker... && npx ts-node index.ts"

echo.
echo ------------------------------------------------------
echo [状态] 启动指令已发送至独立窗口。
echo [提示] 请确保 Redis 与 MySQL 已运行；导出图片依赖 Worker 与 Redis。
echo.
echo [访问路径]:
echo   - 前端界面: http://localhost:5173
echo   - 后端接口: http://localhost:3000
echo ------------------------------------------------------
echo.
echo 按任意键关闭此窗口（不影响已启动的服务）...
pause >nul
