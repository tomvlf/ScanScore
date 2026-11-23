'use strict';
const roomSession={
 async request(method,body,role){
  const response=await fetch(role?`/api/session?role=${encodeURIComponent(role)}`:'/api/session',{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  if(response.status===401)return null;
  if(!response.ok)throw Error(response.status===429?'Te veel aanmeldpogingen. Probeer het later opnieuw.':'Aanmelden kon niet worden verwerkt. Probeer opnieuw.');
  return response.json();
 },
 authentication(role,socketTicket){
  const message={type:'auth',role};
  if(socketTicket)message.socketTicket=socketTicket;
  return message;
 },
 async login(roomName,secret,role){
  const session=await this.request('POST',{roomName,secret},role);
  if(!session)throw Error('Ruimtenaam of wachtwoord is onjuist.');
  return session;
 },
 restore(role){return this.request('GET',undefined,role)},
 async rotatePassword(roomName,currentPassword,newPassword){
  const response=await fetch('/api/session/password',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({roomName,currentPassword,newPassword})});
  if(!response.ok)throw Error(response.status===401?'Huidig wachtwoord is onjuist.':response.status===429?'Te veel pogingen. Probeer later opnieuw.':'Wachtwoord kan niet worden gewijzigd.');
 },
 async logoutAll(){
  const response=await fetch('/api/session/all',{method:'DELETE',credentials:'same-origin'});
  if(!response.ok)throw Error('Sessies konden niet worden ingetrokken.');
 },
 async logout(){
  await this.request('DELETE');
  location.href='/';
 }
};
document.querySelector('#logout').onclick=()=>roomSession.logout().catch(error=>{
 document.querySelector('#status').textContent=error.message;
});
