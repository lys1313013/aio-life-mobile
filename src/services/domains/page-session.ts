import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { onUnmounted, watch } from 'vue'
import { fetchUser } from '../api.ts'
import { restoreSession, session } from '../session.ts'
export function useDomainPage(resume:()=>void, suspend:()=>void){
  let visible=true
  function stop(){visible=false;suspend()}
  onShow(async()=>{restoreSession();visible=true;if(!session.token){suspend();uni.reLaunch({url:'/pages/login/index'});return}const token=session.token;try{if(!session.user)await fetchUser()}catch{}if(visible&&session.token===token)resume()})
  onHide(stop);onUnload(stop);onUnmounted(stop)
  watch(()=>session.token,()=>{suspend();if(visible&&session.token)resume()})
}
