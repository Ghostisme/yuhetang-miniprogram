const api=require('../../utils/api')
const merge=(old,incoming)=>Array.from(new Map([...old,...incoming].map(m=>[m.id,m])).values()).sort((a,b)=>a.seq-b.seq)
const format=rows=>rows.map(m=>({...m,time:(m.createdAt||'').replace('T',' ').slice(5,16)}))

Page({
  data:{site:null,stores:[],storeNames:['品牌客服 · 总部接待'],storeIndex:0,storeId:'',conversation:null,messages:[],draft:'',key:'',busy:false,loading:true,hasOlder:false,olderBusy:false,error:'',scrollTo:''},
  onLoad(options){this.initialStore=options.storeId||'';this.setData({storeId:this.initialStore})},
  async onShow(){
    this.visible=true;const showVersion=(this.showVersion||0)+1;this.showVersion=showVersion
    try{
      const site=await getApp().loadSite();if(!this.visible||showVersion!==this.showVersion)return
      const stores=site.stores.filter(s=>s.enabled),storeId=this.data.site?this.data.storeId:this.initialStore||''
      const storeIndex=stores.findIndex(s=>s.id===storeId)+1
      this.setData({site,stores,storeNames:['品牌客服 · 总部接待',...stores.map(s=>s.name)],storeIndex,storeId:storeIndex?storeId:''})
      await this.open()
    }catch(e){if(this.visible&&showVersion===this.showVersion)this.setData({error:e.message,loading:false})}
  },
  onHide(){this.stop()},
  onUnload(){this.stop()},
  stop(){this.visible=false;this.showVersion=(this.showVersion||0)+1;this.generation=(this.generation||0)+1;clearTimeout(this.timer)},
  valid(version){return this.visible&&version===this.generation},
  async open(){
    clearTimeout(this.timer);const version=(this.generation||0)+1;this.generation=version;this.cursor=0
    const storeId=this.data.storeId
    this.setData({conversation:null,messages:[],draft:'',key:api.id(),busy:false,loading:true,hasOlder:false,olderBusy:false,error:''})
    try{
      await api.login();if(!this.valid(version))return
      const conversation=await api.request('/api/me/chats',{method:'POST',data:{storeId}})
      if(!this.valid(version))return
      this.setData({conversation,loading:false});await this.poll(version,conversation.id)
    }catch(e){if(this.valid(version))this.setData({loading:false,error:e.message})}
  },
  async poll(version,id){
    try{
      const result=await api.request('/api/me/chats/'+id+'/messages?after='+this.cursor)
      if(!this.valid(version))return
      if(this.cursor===0)this.setData({hasOlder:result.items.length===100})
      this.append(result.items)
      if(result.items.length)this.cursor=Math.max(this.cursor,result.items[result.items.length-1].seq)
    }catch(e){if(this.valid(version))this.setData({error:e.message})}
    finally{if(this.valid(version))this.timer=setTimeout(()=>this.poll(version,id),5000+Math.random()*1000)}
  },
  append(items){
    const messages=merge(this.data.messages,format(items)),last=messages[messages.length-1],previous=this.data.messages[this.data.messages.length-1]
    this.setData({messages,...(last&&last.id!==(previous&&previous.id)?{scrollTo:'message-'+last.id}:{})})
  },
  store(e){if(this.data.busy)return;const storeIndex=Number(e.detail.value),storeId=storeIndex?this.data.stores[storeIndex-1].id:'';this.setData({storeIndex,storeId});this.open()},
  input(e){this.setData({draft:e.detail.value,key:api.id()})},
  async send(){
    const d=this.data;if(d.busy||!d.conversation||!d.draft.trim())return
    const version=this.generation,id=d.conversation.id,content=d.draft,clientKey=d.key
    this.setData({busy:true,error:''})
    try{
      await api.request('/api/me/chats/'+id+'/messages',{method:'POST',data:{content,clientKey}})
      if(!this.valid(version))return
      this.setData({draft:'',key:api.id()})
      const result=await api.request('/api/me/chats/'+id+'/messages?after='+this.cursor)
      if(!this.valid(version))return
      this.append(result.items)
      // Polling owns its cursor so a simultaneous send cannot skip an incoming message.
    }catch(e){if(this.valid(version))this.setData({error:e.message})}
    finally{if(this.valid(version))this.setData({busy:false})}
  },
  async older(){
    const d=this.data;if(d.olderBusy||!d.messages.length||!d.conversation)return
    const version=this.generation;this.setData({olderBusy:true})
    try{
      const result=await api.request('/api/me/chats/'+d.conversation.id+'/messages?before='+d.messages[0].seq)
      if(this.valid(version))this.setData({messages:merge(this.data.messages,format(result.items)),hasOlder:result.items.length===100})
    }catch(e){if(this.valid(version))this.setData({error:e.message})}
    finally{if(this.valid(version))this.setData({olderBusy:false})}
  },
  retry(){this.open()},
  call(){const store=this.data.stores.find(s=>s.id===this.data.storeId);api.call(store?store.phone:this.data.site && this.data.site.contact.phone)}
})
