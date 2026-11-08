"""Package the verified Taro WeChat output as an importable developer-tools project."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-id', required=True)
    args = parser.parse_args()
    assert re.fullmatch(r'\d{8}-\d{6}', args.release_id), 'Use YYYYMMDD-HHMMSS'
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip(), 'Commit the reviewed source first'
    subprocess.run(['node', 'tools/check-weapp-build.mjs'], cwd=ROOT, check=True)
    output = ROOT / 'dist/weapp'
    source = [ROOT / name for name in ('package.json', 'project.config.json')] + [p for folder in ('src', 'config') for p in (ROOT / folder).rglob('*') if p.is_file()]
    assert (output / 'app.js').stat().st_mtime >= max(p.stat().st_mtime for p in source), 'Build the current source first'
    config = json.loads((output / 'project.config.json').read_text(encoding='utf-8'))
    assert config['appid'] == 'wxce054e18303efb8a'
    config['miniprogramRoot'] = './'
    config['setting']['urlCheck'] = True
    config['setting']['uploadWithSourceMap'] = False
    config.setdefault('packOptions', {}).setdefault('ignore', []).extend([
        {'type': 'file', 'value': name} for name in ('README.md', 'validation.json', 'SHA256SUMS')])
    payload = {p.relative_to(output).as_posix(): p.read_bytes() for p in output.rglob('*') if p.is_file() and p.suffix != '.map' and p.name != 'project.private.config.json'}
    payload['project.config.json'] = (json.dumps(config, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    report = ROOT / 'backups/customer-profiles/result.json'
    evidence = json.loads(report.read_text(encoding='utf-8'))
    assert evidence['status'] == 'passed' and len(evidence['checks']) >= 10 and not evidence['errors'] and not evidence['unknown']
    # H5 and WeChat outputs share the same source. The H5 browser report must be newer than that source.
    assert report.stat().st_mtime >= max(p.stat().st_mtime for p in source)
    gallery_report = ROOT / 'backups/gallery-preview/result.json'
    gallery = json.loads(gallery_report.read_text(encoding='utf-8'))
    assert gallery['status'] == 'passed' and len(gallery['checks']) >= 3 and not gallery['errors'] and not gallery['unknown']
    assert gallery_report.stat().st_mtime >= max(p.stat().st_mtime for p in source), 'Verify gallery preview against the current source first'
    language_report = ROOT / 'backups/i18n/result.json'
    languages = json.loads(language_report.read_text(encoding='utf-8'))
    assert languages['status'] == 'passed' and len(languages['checks']) >= 12 and not languages['errors'] and not languages['unknown']
    assert languages['locales'] == ['zh', 'en', 'ja'] and languages['liveApisUsed'] is False and languages['realMessagesSent'] is False
    assert language_report.stat().st_mtime >= max(p.stat().st_mtime for p in source), 'Verify all three languages against the current source first'
    native = json.loads((ROOT / 'backups/weapp-native/result.json').read_text(encoding='utf-8'))
    assert native['status'] == 'passed' and not native['failures'], 'Run npm run check:weapp:native before packaging'
    style_hashes = {name: hashlib.sha256(value).hexdigest() for name, value in payload.items() if name.endswith('.wxss')}
    assert native['files'] == style_hashes, 'The native WXSS report does not match the current build'
    validation = dict(releaseId=args.release_id, sourceCommit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        createdAt=dt.datetime.now(dt.timezone.utc).isoformat(), appId=config['appid'], apiBase='https://mp-admin.hetuonian.cn',
        browser=evidence, galleryPreview=gallery, internationalization=languages, nativeWxss=native, nativeBuildIntegrity='passed', uploadedToWechat=False, realWechatDeliveryValidated=False,
        files={name: hashlib.sha256(data).hexdigest() for name, data in sorted(payload.items())})
    payload['validation.json'] = (json.dumps(validation, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    payload['README.md'] = f'''# 裕和堂小程序 {args.release_id}

这是当前 Taro 源码的微信编译结果，可独立导入微信开发者工具；继续开发请使用原源码目录。

1. 此包独立更新小程序，连接配套 Java API；会员跨店预约与结算预留需先更新同版本 Java 和管理后台，可使用配套整体更新包。
2. 解压 ZIP，微信开发者工具导入包含 project.config.json 的目录，AppID 为 wxce054e18303efb8a。
3. 点击编译，确认 API 合法域名含 https://mp-admin.hetuonian.cn；不要开启模拟登录。
4. 点击上传，版本号填写 {args.release_id}，后台选为体验版，用客户微信重新扫码进入。
5. 我的预约不应再出现独立订阅卡片；点击最终提交预约/改约才申请微信原生订阅授权。
6. 测试自助处理截止、改约原时间保留、门店确认/未通过/撤回及两端消息。
7. 在「养护 → 空间美学」滚动后放大、关闭图片，确认仍在当前栏目和浏览位置；回首页的养护、好物入口仍分别进入对应栏目。
8. 英文品牌及版权文字统一为 YU Health；已有品牌数据由配套 Java 的 V12 迁移分别更新发布版和草稿版。
9. 页面右上方切换「中文 / English / 日本語」，确认导航、登录、预约和现有门店品项随之切换，重新进入后保留语言。
10. 切换语言后，正在填写的预约、已选门店和相册栏目应保留；客户姓名、手机号、备注与聊天原文保持原样。预约使用上海时间（UTC+8）。
11. 已核实会员选择其他门店时，项目、时段及调理师按接待门店提供，会员归属保留。结算只登记意向，未启用微信支付或储值扣款。

本包全部 WXSS 已使用微信原生 wcsc 编译器检查，validation.json 记录了成功结果与文件 SHA256。原生检查失败或报告与文件不匹配时不会生成发布包。

当前初始化的 9 家门店及 135 个独立品项已补译；后台以后新增或修改的内容未配译文时显示原文。微信原生授权窗口的语言由微信决定。

该 ZIP 不含服务器、私钥、AppSecret、登录凭证或 private 配置，不会自动上传或发布小程序。
旧手机体验版只有在上传并重新进入新版后才会替换。微信记住订阅选择后，原生授权窗不保证每次出现。
'''.encode('utf-8')
    payload['SHA256SUMS'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(payload.items())).encode('utf-8')
    title = 'yuhetang-miniprogram-weapp-' + args.release_id
    path = ROOT / 'releases' / (title + '.zip')
    checksum = Path(str(path) + '.sha256')
    assert not path.exists() and not checksum.exists(), 'Immutable release already exists'
    path.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(path, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in sorted(payload.items()):
            entry = zipfile.ZipInfo(title + '/' + name)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = (0o100644 << 16)
            archive.writestr(entry, data)
    with zipfile.ZipFile(path) as archive:
        assert not archive.testzip()
        for name, data in payload.items():
            assert archive.read(title + '/' + name) == data
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    checksum.write_text(digest + '  ' + path.name + '\n', encoding='ascii')
    print(json.dumps(dict(zip=str(path), checksum=str(checksum), sha256=digest, files=len(payload), bytes=path.stat().st_size), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
