# React + Vite

## Run StudyFlow locally

From the `frontend` directory, start the backend with `npm start` and the frontend with `npm run dev` in separate terminals. The frontend runs on port 5173 and proxies `/api` requests to the backend on port 5003.

When MongoDB Atlas is unavailable in development, planner data, notes, and sessions are stored at `%LOCALAPPDATA%\StudyFlow\planner-store.json` and survive backend restarts on this computer. This local fallback does not sync across devices. When MongoDB connects, planner data uses Atlas instead.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
