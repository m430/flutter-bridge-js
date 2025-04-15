import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
      staticImport: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'FlutterBridge',
      fileName: (format) => `flutter-bridge.${format}.js`,
      formats: ['es', 'umd', 'cjs'],
    },
    rollupOptions: {
      // external: ['vue'],
      // output: {
      //   globals: {
      //     vue: 'Vue',
      //   },
      // },
    },
    emptyOutDir: true,
  }
})