import { defineConfig } from '@tarojs/cli'

const isDevelopment = process.env.NODE_ENV !== 'production'
const apiBase = process.env.TARO_APP_API_BASE ?? (isDevelopment
  ? process.env.TARO_ENV === 'h5' ? '' : 'http://127.0.0.1:8790'
  : 'https://booking.yuhetangtcm.com')

if (!isDevelopment && apiBase && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(apiBase).hostname)) {
  throw new Error('正式构建不能使用本地接口地址；请配置 TARO_APP_API_BASE。')
}

export default defineConfig<'webpack5'>({
  projectName: 'yuhetang-miniprogram',
  designWidth: 750,
  deviceRatio: { 640: 1.17, 750: 1, 375: 2, 828: 0.905 },
  sourceRoot: 'src',
  outputRoot: process.env.TARO_APP_OUTPUT_ROOT || `dist/${process.env.TARO_ENV || 'weapp'}`,
  framework: 'react',
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  cache: { enable: false },
  plugins: ['@tarojs/plugin-platform-weapp', '@tarojs/plugin-platform-h5'],
  defineConstants: {
    API_BASE_URL: JSON.stringify(apiBase),
    ENABLE_DEV_LOGIN: JSON.stringify(process.env.TARO_APP_DEV_LOGIN === 'true' && isDevelopment),
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
