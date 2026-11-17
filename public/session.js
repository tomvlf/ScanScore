'use strict';
const roomSession={
 async request(method,body){
  const response=await fetch('/api/session',{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  if(response.status===401)return null;
  if(!response.ok)throw Error(response.status===429?'Te veel aanmeldpogingen. Probeer het later opnieuw.':'Aanmelden kon niet worden verwerkt. Probeer opnieuw.');
  return response.json();
 },
 async login(roomName,secret){
  const session=await this.request('POST',{roomName,secret});
  if(!session)throw Error('Ruimtenaam of wachtwoord is onjuist.');
  return session;
 },
 restore(){return this.request('GET')},
 async logout(){
  await this.request('DELETE');
  location.href='/';
 }
};
document.querySelector('#logout').onclick=()=>roomSession.logout().catch(error=>{
 document.querySelector('#status').textContent=error.message;
});
