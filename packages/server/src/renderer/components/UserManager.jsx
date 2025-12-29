import React, { useState, useEffect } from 'react';

export default function UserManager(){
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username:'test', password:'pass', home:'test_home' });

  useEffect(()=>{ refresh(); }, []);

  async function refresh(){
    const res = await window.serverAPI.listUsers();
    setUsers(res.users || []);
  }
  async function add(){
    await window.serverAPI.addUser(form);
    setForm({ username:'', password:'', home:'' });
    await refresh();
  }
  async function remove(u){
    await window.serverAPI.removeUser({ username: u });
    await refresh();
  }

  return (
    <div>
      <h3>用户管理</h3>
      <div>
        <input placeholder="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/>
        <input placeholder="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
        <input placeholder="home" value={form.home} onChange={e=>setForm({...form,home:e.target.value})}/>
        <button onClick={add}>Add</button>
      </div>
      <ul>
        {users.map(u=>(
          <li key={u.username}>{u.username} - {u.home} <button onClick={()=>remove(u.username)}>Del</button></li>
        ))}
      </ul>
    </div>
  );
}
