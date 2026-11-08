import Taro, { useRouter } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { isWeapp } from '../../services/api'
import { LOGIN_CONSENT_VERSION } from '../../utils/session'
import './index.scss'

const terms = [
  ['服务内容', '裕和堂小程序提供门店与养护项目介绍、到店预约和门店咨询。您可以先浏览；查看个人预约、提交预约及使用在线咨询时，需要登录客户账号。'],
  ['预约与接待', '提交预约属于到店申请，需由门店人工确认。调理师意向、房间与床位以门店实际安排为准。修改或取消预约请遵循页面展示的门店规则。'],
  ['账号与使用', '微信登录用于识别客户身份。请妥善保管设备与账号，提供准确的预约联系信息，不冒用他人身份，不在咨询中发送违法或侵权内容。退出登录不会自动取消已提交的预约。'],
  ['消息与咨询', '预约消息提醒需要另行进行微信订阅授权；登录与同意本协议不会自动开启订阅。在线咨询由门店接待，具体回复时间以门店营业与人员安排为准。'],
  ['联系门店', '如需核实服务安排、提出意见或处理账号与资料问题，可通过门店页面的电话、微信客服或在线咨询联系工作人员。'],
]
const privacy = [
  ['登录身份', '您主动点击微信登录后，小程序获取临时登录凭证，由服务端向微信换取用于识别客户账号的标识。微信 AppSecret 与会话密钥不下发到客户端。登录不会自动获取您的手机号、头像或昵称。'],
  ['客户档案与手机号', '微信登录记录首次与最近登录时间。您填写姓名或称呼，并主动点击微信手机号授权后，我们记录经微信授权的手机号与授权时间，用于预约联系及匹配已有客户档案。会员状态由总部维护，小程序、大众点评等来源分别记录；姓名或称呼是您填写的信息，不代表微信实名核验。拒绝手机号授权仍可浏览并手工填写预约联系信息。'],
  ['预约资料', '提交预约时，收集您填写的称呼、联系电话、到店时间、同行人数及服务意向，用于门店确认、接待和必要通知。会员与到店经历为本人自述，需门店核实。'],
  ['咨询与自愿提供的信息', '在线咨询内容用于解答问题、安排接待与保存服务记录。请勿提交身份证、病历等不必要信息；预约中如自愿提供健康信息，需要单独勾选同意。'],
  ['订阅与权限', '预约结果及到店提醒由您另行选择微信订阅授权。地图导航、拨打电话等功能在实际使用时按需调用。拒绝登录或消息订阅不会影响浏览公开的门店与项目信息。'],
  ['资料管理', '您可在“我的预约”查看与管理预约，并退出当前设备的登录。更正、删除个人资料或申请注销账号，请通过门店电话、微信客服联系工作人员。退出登录不会删除服务器中的预约与咨询记录。'],
  ['完整隐私保护指引', '涉及个人信息的具体处理规则，请同时查阅微信小程序展示的《用户隐私保护指引》。如对资料使用有疑问，可联系门店核实后再继续操作。'],
]
export default function Legal() {
  const privacyPage = useRouter().params.kind === 'privacy'
  return <View className='page legal-page'><View className='section'>
    <Text className='eyebrow'>YU HE TANG · SERVICE</Text><View className='heading'>{privacyPage ? '隐私说明' : '用户协议'}</View>
    <View className='muted'>更新日期：{LOGIN_CONSENT_VERSION}</View>
    {(privacyPage ? privacy : terms).map(([title, content]) => <View className='legal-section' key={title}><View>{title}</View><Text>{content}</Text></View>)}
    {privacyPage && isWeapp && <Button className='secondary' onClick={() => { void Taro.openPrivacyContract({ fail: () => { void Taro.showToast({ title: '暂时无法打开，请在小程序设置中查看隐私保护指引。', icon: 'none' }) } }) }}>查看微信隐私保护指引</Button>}
    <Button className='secondary' onClick={() => { if (Taro.getCurrentPages().length > 1) void Taro.navigateBack(); else void Taro.switchTab({ url: '/pages/home/index' }) }}>返回</Button>
  </View></View>
}
