import { defineConfig } from '@tarojs/cli'

export default defineConfig<'webpack5'>({
  projectName: 'yuhetang-miniprogram',
  designWidth: 750,
  deviceRatio: { 640: 1.17, 750: 1, 375: 2, 828: 0.905 },
  sourceRoot: 'src',
  outputRoot: `dist/${process.env.TARO_ENV || 'weapp'}`,
  framework: 'react',
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  cache: { enable: false },
  plugins: ['@tarojs/plugin-platform-weapp', '@tarojs/plugin-platform-h5'],
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.TARO_APP_API_BASE ?? (process.env.TARO_ENV === 'h5' && process.env.NODE_ENV !== 'production' ? '' : 'https://booking.yuhetangtcm.com')),
    ENABLE_DEV_LOGIN: JSON.stringify(process.env.TARO_APP_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production'),
  },
  mini: { postcss: { pxtransform: { enable: true }, cssModules: { enable: false } } },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    router: { mode: 'hash' },
    devServer: {
      host: '127.0.0.1', port: 5182,
      proxy: [{ context: ['/api', '/uploads', '/media'], target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8790', changeOrigin: true }],
    },
    postcss: { pxtransform: { enable: true }, autoprefixer: { enable: true }, cssModules: { enable: false } },
  },
})
