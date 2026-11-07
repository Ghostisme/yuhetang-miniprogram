const api = require('../../utils/api')

Component({
  properties: {
    storeId: {type: String, value: ''},
    label: {type: String, value: '微信客服'},
    variant: {type: String, value: 'secondary'},
    showOnline: {type: Boolean, value: true}
  },
  data: {sessionFrom: 'yht-store:', error: ''},
  observers: {
    storeId(storeId) {
      // Public store context only. Customer identity comes from WeChat's verified callback.
      // Opening native contact does not depend on our login, API or web chat polling.
      this.setData({sessionFrom: 'yht-store:' + (storeId || ''), error: ''})
    }
  },
  methods: {
    online() {api.contact(this.data.storeId || '')},
    nativeError() {this.setData({error: '微信客服暂时无法打开，请稍后重试或使用在线咨询。'})}
  }
})
