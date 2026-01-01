# FTP文件传输项目

源码包含两部分，服务器端程序和客户端程序，分别位于 `packages/server` 和 `packages/client` 中。

## 基本信息说明

开发环境：

- 操作系统：WSL2（开发）和Windows（测试）
- IDE：Visual Studio Code，Developer Command Prompt for VS 2022

技术框架：

- 前端框架：Vite + React (JSX)
- 后端及桌面应用框架：Electron

包管理与构建工具：

- npm (Node.js v18+)
- electron-builder 24.6.0

本地数据库：

- SQLite3 (sqlite3@5.1.6)

其他说明：

- npm可以指定发布平台，一般不建议在WSL2中打包发布，本项目尽管在WSL2的Linux环境下开发，但最终在Windows下测试并发布了可执行文件
- Github仓库：[https://github.com/Zumarongi/ftp-app](https://github.com/Zumarongi/ftp-app)
- 以下命令如未经说明，默认在Linux环境下执行

## 源码说明

### 服务器端程序

#### 服务器端目录结构简介

目录 `packages/server/` 结构如下：

``` txt
.
├── package-lock.json
├── package.json
├── src
│   ├── electron
│   │   ├── ftpServer.js
│   │   ├── main.js
│   │   └── preload.js
│   └── renderer
│       ├── App.jsx
│       ├── components
│       │   ├── ServerControl.jsx
│       │   └── UserManager.jsx
│       ├── index.html
│       └── main.jsx
└── vite.config.js
```

- `package.json` / `package-lock.json`：项目依赖与脚本配置文件，定义了构建、打包及运行 Electron 应用所需的依赖关系。
- `vite.config.js`：Vite 构建配置文件，用于前端渲染进程的开发与生产构建。
- `src/electron/`：Electron 服务器端主进程相关
  - `main.js`：Electron 主进程入口文件，负责应用生命周期管理、窗口创建及 IPC 通信注册。
  - `preload.js`：预加载脚本，在主进程与渲染进程之间提供安全的 API 桥接。
  - `ftpServer.js`：FTP 服务器相关逻辑实现，包含服务启动、连接管理及核心业务处理。
- `src/renderer/`：前端界面
  - `index.html`：渲染进程入口 HTML 文件。
  - `main.jsx`：前端应用入口，负责挂载 React 应用并初始化全局配置。
  - `App.jsx`：前端应用根组件，定义整体页面结构与路由逻辑。
  - `components/`：前端功能组件目录
    - `ServerControl.jsx`：服务器控制相关组件
    - `UserManager.jsx`：用户管理相关组件

#### 服务器端测试与发布

1. 进入目录 `cd packages/server`
2. 安装依赖 `npm install`
   - 如果 Electron 安装出错，可以尝试换源 `export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
3. 调试模式运行 `npm run dev`
   - 如果 sqlite3 运行时出错，可以尝试重构 `npx electron-rebuild -f -w sqlite3`
4. 打包发布 `npm run dist`

### 客户端程序

#### 客户端目录结构简介

目录 `packages/client/` 结构如下：

``` plaintext
.
├── package-lock.json
├── package.json
├── src
│   ├── electron
│   │   ├── ftpClient.js
│   │   ├── main.js
│   │   └── preload.js
│   └── renderer
│       ├── App.jsx
│       ├── components
│       │   ├── DirectoryTree.jsx
│       │   ├── DownloadQueue.jsx
│       │   ├── DownloadResultDialog.jsx
│       │   └── SiteManager.jsx
│       ├── index.html
│       └── main.jsx
└── vite.config.js
```

- `package.json` / `package-lock.json`：项目依赖与脚本配置文件，定义了客户端应用的构建、打包及运行所需的依赖关系。
- `vite.config.js`：Vite 构建配置文件，用于客户端前端渲染进程的开发与生产环境构建。
- `src/electron/`：Electron 客户端主进程相关
  - `main.js`：Electron 主进程入口文件，负责客户端窗口创建、应用生命周期管理及 IPC 通信。
  - `preload.js`：预加载脚本，在主进程与渲染进程之间暴露安全的客户端 API。
  - `ftpClient.js`：FTP 客户端核心逻辑，实现服务器连接、文件操作及相关业务功能。
- `src/renderer/`：客户端前端界面
  - `index.html`：渲染进程入口 HTML 文件。
  - `main.jsx`：前端应用入口，负责挂载 React 应用并完成初始化。
  - `App.jsx`：前端应用根组件，定义整体页面结构与核心逻辑。
  - `components/`：前端功能组件目录
    - `DirectoryTree.jsx`：远程或本地目录树展示组件
    - `DownloadQueue.jsx`：下载队列与进度管理组件
    - `DownloadResultDialog.jsx`：下载结果展示对话框组件
    - `SiteManager.jsx`：站点配置与服务器管理相关组件

#### 客户端测试与发布

1. 进入目录 `cd packages/server`
2. 安装依赖 `npm install`
   - 如果 Electron 安装出错，可以尝试换源 `export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
3. 调试模式运行 `npm run dev`
4. 打包发布 `npm run dist`
