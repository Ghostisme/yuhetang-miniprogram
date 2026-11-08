export default defineAppConfig({
  pages: ['pages/home/index', 'pages/catalog/index', 'pages/stores/index', 'pages/orders/index', 'pages/booking/index', 'pages/chat/index', 'pages/store-detail/index', 'pages/login/index', 'pages/legal/index'],
  window: { navigationBarTitleText: '裕和堂', navigationBarBackgroundColor: '#faf9f3', navigationBarTextStyle: 'black', backgroundColor: '#faf9f3' },
  tabBar: {
    color: '#8b9788', selectedColor: '#405c49', backgroundColor: '#faf9f3', borderStyle: 'white',
    list: [{ pagePath: 'pages/home/index', iconPath: 'assets/tabbar/home.png', selectedIconPath: 'assets/tabbar/home-active.png', text: '首页' }, { pagePath: 'pages/catalog/index', iconPath: 'assets/tabbar/care.png', selectedIconPath: 'assets/tabbar/care-active.png', text: '养护' }, { pagePath: 'pages/stores/index', iconPath: 'assets/tabbar/stores.png', selectedIconPath: 'assets/tabbar/stores-active.png', text: '门店' }, { pagePath: 'pages/orders/index', iconPath: 'assets/tabbar/orders.png', selectedIconPath: 'assets/tabbar/orders-active.png', text: '我的预约' }],
  },
  style: 'v2', lazyCodeLoading: 'requiredComponents',
})
