KAI budget spreadsheet: Univer 1.3.1 (Apache-2.0, https://github.com/dream-num/univer) with React 18.3.1 and rxjs 7.8.1,
bundled with esbuild 0.24.0 from kai-grid.src.js:
  npx esbuild kai-grid.src.js --bundle --minify --format=iife --target=es2019 --outfile=kai-grid.js --define:process.env.NODE_ENV='"production"'
Only the guest-list page's Budget tab loads it, and only for events whose budget is a spreadsheet (source = grid).
