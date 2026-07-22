import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, LogOut, Sun, Moon, Shield, Copy, Check, 
  ThumbsUp, ThumbsDown, FileText, Send, UserCheck, X, Database
} from 'lucide-react';

const API_BASE = 'http://localhost:8000/api/v1';

// Custom lightweight markdown + table parser
const renderMessageContent = (text) => {
  if (!text) return null;

  // Replace markdown bold **text** with <strong>text</strong>
  let formatted = text;
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Split lines to detect tables
  const lines = formatted.split('\n');
  const elements = [];
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('|') && line.endsWith('|')) {
      // It's a table line
      const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else if (line.includes('---') || line.includes('- -')) {
        // Skip separator line
        continue;
      } else {
        tableRows.push(cells);
      }
    } else {
      // If we were in a table, close it and push table element
      if (inTable) {
        elements.push(
          <div key={`table-${i}`} className="table-container">
            <table>
              <thead>
                <tr>
                  {tableHeaders.map((h, idx) => (
                    <th key={idx} dangerouslySetInnerHTML={{ __html: h }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} dangerouslySetInnerHTML={{ __html: cell }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        inTable = false;
        tableHeaders = [];
        tableRows = [];
      }
      
      // Push regular line (if not empty or just spacing)
      if (line !== '') {
        // Handle collapsible details blocks for SQL
        if (line.startsWith('<details>') || line.startsWith('</details>') || line.startsWith('<summary>')) {
          // Pass HTML structure directly
          elements.push(<div key={i} dangerouslySetInnerHTML={{ __html: line }} />);
        } else {
          elements.push(
            <p key={i} className="mb-2" dangerouslySetInnerHTML={{ __html: line }} />
          );
        }
      }
    }
  }

  // Handle case where table is at the very end of the message
  if (inTable) {
    elements.push(
      <div key="table-end" className="table-container">
        <table>
          <thead>
            <tr>
              {tableHeaders.map((h, idx) => (
                <th key={idx} dangerouslySetInnerHTML={{ __html: h }} />
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} dangerouslySetInnerHTML={{ __html: cell }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <div>{elements}</div>;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('auth'); // 'auth', 'chat', 'admin'
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState('light');
  
  // Loading states
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  // Auth Form State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  // Dropdown & Modal States
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackItem, setFeedbackItem] = useState(null); // { question, response, thumbsUp, thumbsDown }
  const [feedbackComment, setFeedbackComment] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Chat message input
  const [messageInput, setMessageInput] = useState('');

  // Admin View State
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminRoles, setAdminRoles] = useState([]);
  const [adminRules, setAdminRules] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');
  const [newRulePredicate, setNewRulePredicate] = useState('');
  const [mapUserId, setMapUserId] = useState('');
  const [mapRoleId, setMapRoleId] = useState('');
  const [mapRuleId, setMapRuleId] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [adminSchema, setAdminSchema] = useState(null);
  const [activeAdminTab, setActiveAdminTab] = useState('analytics'); // 'analytics', 'rbac', 'model'
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [logsPage, setLogsPage] = useState(1);
  const [userDirectoryPage, setUserDirectoryPage] = useState(1);
  const [llmStatus, setLlmStatus] = useState(null);

  const fetchLlmStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/llm-status`, { credentials: 'include' });
      if (res.ok) {
        setLlmStatus(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch LLM status:', e);
    }
  };

  const messagesEndRef = useRef(null);

  // Load user session on startup
  useEffect(() => {
    fetchMe();
    // Retrieve theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Scroll to bottom on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isLoadingMessages]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const fetchMe = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setCurrentPage('chat');
        fetchChats();
        fetchLlmStatus();
      } else {
        setUser(null);
        setCurrentPage('auth');
      }
    } catch (e) {
      setUser(null);
      setCurrentPage('auth');
    }
  };

  const fetchChats = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/list`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectChat = async (chatId) => {
    setCurrentChatId(chatId);
    setIsLoadingMessages(false);
    try {
      const res = await fetch(`${API_BASE}/chat/detail/${chatId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.history_data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    setRegSuccess(false);

    if (regPassword.length < 5 || regPassword.length > 20) {
      setAuthError('Password must be between 5 and 20 characters.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: regUsername, password: regPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegSuccess(true);
        setRegUsername('');
        setRegPassword('');
      } else {
        setAuthError(data.detail || 'Registration failed.');
      }
    } catch (err) {
      setAuthError('Network error. Failed to register.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        fetchMe();
      } else {
        setAuthError(data.detail || 'Login failed.');
      }
    } catch (err) {
      setAuthError('Network error. Failed to login.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
      setUser(null);
      setCurrentChatId(null);
      setChatMessages([]);
      setChats([]);
      setCurrentPage('auth');
      setDropdownOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewChat = async () => {
    setIsLoadingMessages(false);
    try {
      const res = await fetch(`${API_BASE}/chat/new`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        fetchChats();
        selectChat(data.chat_id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteChat = async (chatId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat session?')) return;
    try {
      const res = await fetch(`${API_BASE}/chat/delete/${chatId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        fetchChats();
        if (currentChatId === chatId) {
          setCurrentChatId(null);
          setChatMessages([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !currentChatId) return;

    const userMsg = messageInput.trim();
    setMessageInput('');
    setIsLoadingMessages(true);

    // Optimistically update frontend history list
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);

    try {
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: currentChatId, message: userMsg }),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        // Update messages from response
        setChatMessages(prev => [
          ...prev, 
          { 
            role: 'ai', 
            content: data.response, 
            latency_ms: data.latency_ms,
            sql: data.sql 
          }
        ]);
        fetchChats(); // Refresh title list
      } else {
        setChatMessages(prev => [...prev, { role: 'ai', content: `Error: ${data.detail || 'Failed to get response.'}` }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'ai', content: 'Connection error. Unable to contact server.' }]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const openFeedbackModal = (msg, thumbsUp) => {
    // Find matching user question (the message right before the AI response)
    const aiIdx = chatMessages.indexOf(msg);
    const userQuestion = aiIdx > 0 ? chatMessages[aiIdx - 1].content : '';
    
    setFeedbackItem({
      chat_id: currentChatId,
      thumbs_up: thumbsUp,
      thumbs_down: !thumbsUp,
      user_question: userQuestion,
      ai_response: msg.content
    });
    setFeedbackComment('');
    setFeedbackOpen(true);
  };

  const submitFeedback = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...feedbackItem,
          comment: feedbackComment
        }),
        credentials: 'include'
      });
      if (res.ok) {
        setFeedbackOpen(false);
        setFeedbackItem(null);
        alert('Feedback submitted successfully!');
      }
    } catch (err) {
      alert('Failed to submit feedback.');
    }
  };

  const handleExportPDF = () => {
    if (!currentChatId) return;
    window.open(`${API_BASE}/chat/export/${currentChatId}`, '_blank');
  };

  // ----------------------------------------------------
  // ADMIN PANEL UTILITIES
  // ----------------------------------------------------

  const enterAdminPanel = () => {
    setCurrentPage('admin');
    setDropdownOpen(false);
    fetchAdminData();
  };

  const fetchAdminData = async () => {
    setAdminError('');
    setAdminSuccess('');
    try {
      // 1. Fetch Users
      let res = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
      if (res.ok) setAdminUsers(await res.json());

      // 2. Fetch Roles
      res = await fetch(`${API_BASE}/admin/roles`, { credentials: 'include' });
      if (res.ok) setAdminRoles(await res.json());

      // 3. Fetch Rules
      res = await fetch(`${API_BASE}/admin/rules`, { credentials: 'include' });
      if (res.ok) setAdminRules(await res.json());

      // 4. Fetch Analytics
      res = await fetch(`${API_BASE}/admin/analytics`, { credentials: 'include' });
      if (res.ok) setAdminAnalytics(await res.json());

      // 5. Fetch Schema
      res = await fetch(`${API_BASE}/admin/schema`, { credentials: 'include' });
      if (res.ok) setAdminSchema(await res.json());

      // 6. Fetch LLM Status
      fetchLlmStatus();

    } catch (e) {
      setAdminError('Failed to fetch admin dashboard directory logs.');
    }
  };

  const handleExportLogsCSV = () => {
    if (!adminAnalytics || !adminAnalytics.recent_logs || !adminAnalytics.recent_logs.length) return;
    
    const headers = ["Log ID", "Recorded At", "Status", "Latency (s)", "Tokens", "Throughput (tps)", "SQL"];
    const rows = adminAnalytics.recent_logs.map(log => [
      log.log_id,
      `"${new Date(log.recorded_at).toLocaleString().replace(/"/g, '""')}"`,
      log.status,
      (log.latency_ms / 1000).toFixed(2),
      log.total_tokens,
      log.throughput,
      `"${(log.sql || '').replace(/"/g, '""')}"`
    ]);
    
    const csvString = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `talk_to_data_telemetry_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Mouse Drag-to-Pan Handlers for ER Diagram
  const handleERMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click dragging
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleERMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleERMouseUp = () => {
    setIsDragging(false);
  };

  const getFilteredColumns = (table) => {
    return (table.columns || []).filter(col => {
      const desc = (col.description || '').toLowerCase();
      const name = (col.name || '').toLowerCase();
      const isPK = name.endsWith('_id') && (desc.includes('primary') || desc.includes('identity'));
      const isFK = desc.includes('foreign key referencing');
      return isPK || isFK;
    }).map(col => {
      const desc = (col.description || '').toLowerCase();
      const isPK = col.name.endsWith('_id') && (desc.includes('primary') || desc.includes('identity'));
      return {
        name: col.name,
        type: col.type,
        isPK,
        isFK: !isPK
      };
    });
  };

  const getERRelationships = (tables) => {
    const edges = [];
    tables.forEach(table => {
      (table.columns || []).forEach(col => {
        const desc = col.description || '';
        if (desc.toLowerCase().includes('foreign key referencing')) {
          const match = desc.match(/referencing\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i);
          if (match) {
            edges.push({
              sourceTable: table.table_name,
              sourceCol: col.name,
              targetTable: match[1],
              targetCol: match[2]
            });
          }
        }
      });
    });
    return edges;
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    try {
      const res = await fetch(`${API_BASE}/admin/roles/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_name: newRoleName, description: newRoleDesc }),
        credentials: 'include'
      });
      if (res.ok) {
        setAdminSuccess(`Role "${newRoleName}" created!`);
        setNewRoleName('');
        setNewRoleDesc('');
        fetchAdminData();
      } else {
        const d = await res.json();
        setAdminError(d.detail || 'Failed to create role.');
      }
    } catch (err) {
      setAdminError('Network error creating role.');
    }
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    try {
      const res = await fetch(`${API_BASE}/admin/rules/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_name: newRuleName, description: newRuleDesc, sql_predicate: newRulePredicate }),
        credentials: 'include'
      });
      if (res.ok) {
        setAdminSuccess(`Rule "${newRuleName}" created!`);
        setNewRuleName('');
        setNewRuleDesc('');
        setNewRulePredicate('');
        fetchAdminData();
      } else {
        const d = await res.json();
        setAdminError(d.detail || 'Failed to create rule.');
      }
    } catch (err) {
      setAdminError('Network error creating rule.');
    }
  };

  const handleElevateUser = async (userId, targetAccess) => {
    setAdminError('');
    setAdminSuccess('');
    try {
      const res = await fetch(`${API_BASE}/admin/users/elevate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, access_type: targetAccess }),
        credentials: 'include'
      });
      if (res.ok) {
        setAdminSuccess('User clearance level elevated.');
        fetchAdminData();
      } else {
        const d = await res.json();
        setAdminError(d.detail || 'Elevation failed.');
      }
    } catch (err) {
      setAdminError('Network exception running elevation.');
    }
  };

  const handleMapUserRole = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    if (!mapUserId || !mapRoleId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/mappings/user-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: parseInt(mapUserId), role_id: parseInt(mapRoleId) }),
        credentials: 'include'
      });
      if (res.ok) {
        setAdminSuccess('User successfully mapped to Role.');
        fetchAdminData();
      } else {
        const d = await res.json();
        setAdminError(d.detail || 'Failed user-role mapping.');
      }
    } catch (err) {
      setAdminError('Network exception mapping user to role.');
    }
  };

  const handleMapRoleRule = async (e) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    if (!mapRoleId || !mapRuleId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/mappings/role-rule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: parseInt(mapRoleId), rule_id: parseInt(mapRuleId) }),
        credentials: 'include'
      });
      if (res.ok) {
        setAdminSuccess('Role successfully mapped to Rule.');
        fetchAdminData();
      } else {
        const d = await res.json();
        setAdminError(d.detail || 'Failed role-rule mapping.');
      }
    } catch (err) {
      setAdminError('Network exception mapping role to rule.');
    }
  };

  const handleUnmapUserRole = async (userId, roleId) => {
    setAdminError('');
    setAdminSuccess('');
    try {
      const res = await fetch(`${API_BASE}/admin/mappings/user-role?user_id=${userId}&role_id=${roleId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setAdminSuccess('Removed user-role link.');
        fetchAdminData();
      }
    } catch (e) {
      setAdminError('Failed to delete mapping.');
    }
  };

  const handleUnmapRoleRule = async (roleId, ruleId) => {
    setAdminError('');
    setAdminSuccess('');
    try {
      const res = await fetch(`${API_BASE}/admin/mappings/role-rule?role_id=${roleId}&rule_id=${ruleId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setAdminSuccess('Removed role-rule link.');
        fetchAdminData();
      }
    } catch (e) {
      setAdminError('Failed to delete mapping.');
    }
  };

  // Filter chats by search keyword
  const filteredChats = chats.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app-container">
      {/* 1. TOP HEADER (UNIVERSAL LAYOUT) */}
      {currentPage !== 'auth' && (
        <header className="app-header">
          <div className="header-left">
            <img 
              className="header-logo" 
              src={theme === 'light' ? '/logo.png' : '/logo_dark.png'} 
              alt="Logo" 
            />
            <span className="header-title">Talk-to-Data</span>
          </div>
          <div className="header-right">
            <button 
              className="user-avatar-btn" 
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </button>
            
            {dropdownOpen && (
              <div className="avatar-dropdown">
                <div style={{ padding: '8px 12px', fontSize: '12px', color: 'grey' }}>
                  Logged in as: <b>{user?.username}</b> ({user?.access_type})
                </div>
                {llmStatus && (
                  <div style={{ padding: '0px 12px 8px 12px', fontSize: '11px', color: 'grey', marginTop: '-4px' }}>
                    🤖 Active LLM: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{llmStatus.active_model_name}</span>
                  </div>
                )}
                <div className="dropdown-divider"></div>
                <button className="dropdown-item" onClick={toggleTheme}>
                  {theme === 'light' ? (
                    <>
                      <Moon size={16} /> Dark Interface
                    </>
                  ) : (
                    <>
                      <Sun size={16} /> Light Interface
                    </>
                  )}
                </button>
                {user?.access_type === 'Admin' && currentPage !== 'admin' && (
                  <button className="dropdown-item" onClick={enterAdminPanel}>
                    <Shield size={16} /> Admin Panel
                  </button>
                )}
                {currentPage === 'admin' && (
                  <button className="dropdown-item" onClick={() => setCurrentPage('chat')}>
                    <Database size={16} /> Chat Workspace
                  </button>
                )}
                <div className="dropdown-divider"></div>
                <button className="dropdown-item" style={{ color: '#D32F2F' }} onClick={handleLogout}>
                  <LogOut size={16} /> Logout
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      {/* 2. SPLIT ONBOARDING (LOGIN / REGISTER VIEWPORTS) */}
      {currentPage === 'auth' && (
        <div className="split-auth-container">
          <button 
            className="auth-theme-toggle" 
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {/* Left: Login Column */}
          <div className="auth-column login">
            <div className="auth-card">
              <h2 className="auth-title">Welcome Back</h2>
              <p className="auth-subtitle">Log in with your corporate credential profile.</p>
              
              {authError && !regSuccess && <div className="auth-error-banner">{authError}</div>}
              {regSuccess && <div className="auth-error-banner" style={{backgroundColor: '#E8F5E9', color: '#2E7D32', borderColor: '#C8E6C9'}}>Registration successful! You can now log in.</div>}

              <form onSubmit={handleLogin} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-auth-submit">Sign In</button>
              </form>
            </div>
          </div>

          {/* Right: Registration Column */}
          <div className="auth-column register">
            <div className="auth-card">
              <h2 className="auth-title">Create Account</h2>
              <p className="auth-subtitle font-medium">New registrations receive standard User security clearance.</p>

              <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                  <span className={`auth-validation-hint ${(regPassword.length >= 5 && regPassword.length <= 20) ? 'valid' : ''}`}>
                    * Password must be between 5 and 20 characters (Current: {regPassword.length})
                  </span>
                </div>
                <button type="submit" className="btn-auth-submit">Register</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 3. CORE CHAT INTERFACE WORKSPACE */}
      {currentPage === 'chat' && (
        <div className="workspace-wrapper">
          {/* Left Navigation Sidebar */}
          <aside className="sidebar-panel">
            <div className="sidebar-action">
              <button className="btn-new-chat" onClick={handleNewChat}>
                <Plus size={16} /> New Chat
              </button>
            </div>
            
            <div className="sidebar-search">
              <div className="search-wrapper">
                <Search size={16} className="search-icon" />
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Filter chat history..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            
            <div className="sidebar-history">
              {filteredChats.map((c) => (
                <button 
                  key={c.chat_id}
                  className={`history-item ${currentChatId === c.chat_id ? 'active' : ''}`}
                  onClick={() => selectChat(c.chat_id)}
                >
                  <span className="history-title">{c.title}</span>
                  <span 
                    className="history-delete-btn" 
                    onClick={(e) => handleDeleteChat(c.chat_id, e)}
                  >
                    <X size={14} />
                  </span>
                </button>
              ))}
              {filteredChats.length === 0 && (
                <div style={{ textAlign: 'center', color: 'grey', fontSize: '13px', marginTop: '20px' }}>
                  No sessions found
                </div>
              )}
            </div>
          </aside>

          {/* Main Chat Canvas */}
          <main className="chat-canvas">
            {currentChatId ? (
              <>
                <div className="canvas-messages-scroller">
                  {chatMessages.length === 0 && (
                    <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '400px', color: 'grey' }}>
                      <Database size={48} style={{ margin: '0 auto 16px auto', opacity: 0.3 }} />
                      <h3>Ask Talk-to-Data</h3>
                      <p style={{ fontSize: '13px', marginTop: '8px' }}>
                        Ask questions in plain English to query the database. For example: 
                        <br/>
                        <code style={{background: 'rgba(128,128,128,0.1)', padding: '2px 4px', borderRadius: '4px', display: 'inline-block', marginTop: '6px'}}>
                          "Show total order sales in the US region"
                        </code>
                      </p>
                    </div>
                  )}
                  
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`chat-bubble-row ${msg.role}`}>
                      <div className="bubble-container">
                        <span className="bubble-meta">
                          {msg.role === 'user' ? user?.username : 'AI Agent'}
                        </span>
                        
                        <div className="bubble-card">
                          {renderMessageContent(msg.content)}
                          
                          {/* Collapsed SQL output inside AI bubble if present */}
                          {msg.role === 'ai' && msg.sql && (
                            <details className="sql-details-block">
                              <summary className="sql-details-summary">View Generated SQL</summary>
                              <div className="sql-details-content">{msg.sql}</div>
                            </details>
                          )}
                        </div>

                        {/* AI Bubble Actions & Latency */}
                        {msg.role === 'ai' && (
                          <div className="bubble-actions-row">
                            {msg.latency_ms && (
                              <span className="latency-metric">
                                {(msg.latency_ms / 1000).toFixed(1)}s
                              </span>
                            )}
                            
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <button 
                                className="bubble-action-btn"
                                title="Copy response to clipboard"
                                onClick={() => copyToClipboard(msg.content, idx)}
                              >
                                <Copy size={13} />
                              </button>
                              {copiedIndex === idx && <span className="copied-tooltip">Copied</span>}
                            </div>
                            
                            <button 
                              className="bubble-action-btn"
                              title="Thumbs Up"
                              onClick={() => openFeedbackModal(msg, true)}
                            >
                              <ThumbsUp size={13} />
                            </button>
                            
                            <button 
                              className="bubble-action-btn"
                              title="Thumbs Down"
                              onClick={() => openFeedbackModal(msg, false)}
                            >
                              <ThumbsDown size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isLoadingMessages && (
                    <div className="chat-bubble-row ai">
                      <div className="bubble-container">
                        <span className="bubble-meta">AI Agent</span>
                        <div className="awaiting-state-row">
                          <span style={{ fontSize: '13px', color: 'grey' }}>Formulating query response</span>
                          <div className="dot-pulse">
                            <div className="dot"></div>
                            <div className="dot"></div>
                            <div className="dot"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Prompt Dock & Export Trigger */}
                <div className="prompt-dock-container">
                  <form onSubmit={handleSendMessage} className="prompt-bar-wrapper">
                    <input 
                      type="text" 
                      className="prompt-input"
                      placeholder="Ask a question about database records..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      disabled={isLoadingMessages}
                    />
                    <div className="prompt-actions-dock">
                      <button 
                        type="button" 
                        className="btn-prompt-action" 
                        title="Export transcript to PDF"
                        onClick={handleExportPDF}
                        disabled={chatMessages.length === 0}
                      >
                        <FileText size={18} />
                      </button>
                      <button 
                        type="submit" 
                        className="btn-prompt-action send"
                        disabled={!messageInput.trim() || isLoadingMessages}
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'grey' }}>
                <h2>Talk-to-Data Workspace</h2>
                <p style={{ marginTop: '10px' }}>Create a new chat session or select a historical log to get started.</p>
                <button 
                  className="btn-primary-action" 
                  style={{ marginTop: '20px', padding: '12px 24px' }}
                  onClick={handleNewChat}
                >
                  Start New Session
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* 4. ADMIN PANEL VIEWPORT */}
      {currentPage === 'admin' && user?.access_type === 'Admin' && (
        <div className="admin-viewport">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>Admin Configuration Panel</h2>
              <p style={{ color: 'grey', fontSize: '14px', marginTop: '4px' }}>Control user directories, elevation, and RBAC predicates.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={fetchAdminData}>
                Refresh Analytics
              </button>
              <button className="btn-secondary" onClick={() => setCurrentPage('chat')}>
                Back to Chat
              </button>
            </div>
          </div>

          {/* Sub-Tabs Selector */}
          <div className="admin-tabs" style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border-color)', margin: '20px 0 10px 0', paddingBottom: '0' }}>
            <button 
              className={`admin-tab-btn ${activeAdminTab === 'analytics' ? 'active' : ''}`}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeAdminTab === 'analytics' ? '2px solid var(--btn-primary, #2563eb)' : '2px solid transparent',
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: '600',
                color: activeAdminTab === 'analytics' ? 'var(--text-primary)' : 'grey',
                fontSize: '14px'
              }}
              onClick={() => setActiveAdminTab('analytics')}
            >
              Analytics Dashboard
            </button>
            <button 
              className={`admin-tab-btn ${activeAdminTab === 'rbac' ? 'active' : ''}`}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeAdminTab === 'rbac' ? '2px solid var(--btn-primary, #2563eb)' : '2px solid transparent',
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: '600',
                color: activeAdminTab === 'rbac' ? 'var(--text-primary)' : 'grey',
                fontSize: '14px'
              }}
              onClick={() => setActiveAdminTab('rbac')}
            >
              RBAC Settings
            </button>
            <button 
              className={`admin-tab-btn ${activeAdminTab === 'model' ? 'active' : ''}`}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeAdminTab === 'model' ? '2px solid var(--btn-primary, #2563eb)' : '2px solid transparent',
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: '600',
                color: activeAdminTab === 'model' ? 'var(--text-primary)' : 'grey',
                fontSize: '14px'
              }}
              onClick={() => setActiveAdminTab('model')}
            >
              Data Model View
            </button>
            <button 
              className={`admin-tab-btn ${activeAdminTab === 'model_settings' ? 'active' : ''}`}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeAdminTab === 'model_settings' ? '2px solid var(--btn-primary, #2563eb)' : '2px solid transparent',
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: '600',
                color: activeAdminTab === 'model_settings' ? 'var(--text-primary)' : 'grey',
                fontSize: '14px'
              }}
              onClick={() => setActiveAdminTab('model_settings')}
            >
              Model Settings
            </button>
          </div>

          {activeAdminTab === 'analytics' && (
            <>
              {/* Analytics Dashboard Grid */}
          {adminAnalytics && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ marginBottom: '10px', fontSize: '15px', fontWeight: '600' }}>System Performance Analytics</h3>
              <div className="analytics-grid">
                <div className="analytics-card">
                  <span className="analytics-card-label">Total Queries</span>
                  <span className="analytics-card-value">{adminAnalytics.total_queries}</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-card-label">Total Failures</span>
                  <span className="analytics-card-value" style={{ color: adminAnalytics.total_failures > 0 ? '#D32F2F' : 'inherit' }}>
                    {adminAnalytics.total_failures}
                  </span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-card-label">Avg Latency</span>
                  <span className="analytics-card-value">{(adminAnalytics.avg_latency_ms / 1000).toFixed(2)}s</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-card-label">Avg Throughput</span>
                  <span className="analytics-card-value">{adminAnalytics.avg_throughput_tps} tps</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-card-label">Tokens Consumed</span>
                  <span className="analytics-card-value">{adminAnalytics.tokens.total.toLocaleString()}</span>
                  <div style={{ fontSize: '11px', color: 'grey', marginTop: '4px' }}>
                    P: {adminAnalytics.tokens.prompt.toLocaleString()} | C: {adminAnalytics.tokens.completion.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Recent Execution Logs */}
              <div className="admin-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 className="admin-card-title" style={{ margin: '0' }}>Recent Query Execution Logs</h3>
                  <button 
                    className="btn-secondary" 
                    onClick={handleExportLogsCSV}
                    style={{ padding: '6px 12px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    📥 Export (CSV)
                  </button>
                </div>
                <div className="table-container">
                  <table>
                     <thead>
                       <tr>
                         <th>Log ID</th>
                         <th>Recorded At</th>
                         <th>Status</th>
                         <th>Latency</th>
                         <th>Tokens</th>
                         <th>Throughput</th>
                         <th>Generated SQL</th>
                       </tr>
                     </thead>
                     <tbody>
                       {adminAnalytics.recent_logs.slice((logsPage - 1) * 20, logsPage * 20).map((log) => (
                         <tr key={log.log_id}>
                           <td>{log.log_id}</td>
                           <td>{new Date(log.recorded_at).toLocaleString()}</td>
                           <td>
                             <span className="admin-badge" style={{
                               backgroundColor: log.status.toLowerCase() === 'success' ? '#E8F5E9' : '#FFEBEE',
                               color: log.status.toLowerCase() === 'success' ? '#2E7D32' : '#C62828',
                               borderColor: log.status.toLowerCase() === 'success' ? '#C8E6C9' : '#FFCDD2',
                               border: '1px solid',
                               padding: '2px 6px',
                               borderRadius: '4px',
                               fontSize: '11px',
                               fontWeight: '600'
                             }}>
                               {log.status}
                             </span>
                           </td>
                           <td>{(log.latency_ms / 1000).toFixed(2)}s</td>
                           <td>{log.total_tokens}</td>
                           <td>{log.throughput} tps</td>
                           <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.sql}>
                             <code>{log.sql || 'N/A'}</code>
                           </td>
                         </tr>
                       ))}
                       {adminAnalytics.recent_logs.length === 0 && (
                         <tr>
                           <td colSpan="7" style={{ textAlign: 'center', color: 'grey', padding: '20px' }}>
                             No telemetry logs recorded yet.
                           </td>
                         </tr>
                       )}
                     </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {adminAnalytics.recent_logs.length > 20 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      disabled={logsPage === 1}
                      onClick={() => setLogsPage(p => p - 1)}
                    >
                      ◀ Previous
                    </button>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
                      Page {logsPage} of {Math.ceil(adminAnalytics.recent_logs.length / 20)}
                    </span>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      disabled={logsPage >= Math.ceil(adminAnalytics.recent_logs.length / 20)}
                      onClick={() => setLogsPage(p => p + 1)}
                    >
                      Next ▶
                    </button>
                  </div>
                )}

                {/* Direct DB Extract Information Notice */}
                <div style={{
                  marginTop: '16px',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  borderLeft: '4px solid var(--btn-primary, #2563eb)',
                  backgroundColor: 'var(--bg-canvas, #F9FAFB)',
                  fontSize: '12px',
                  color: 'grey'
                }}>
                  ℹ️ To extract the full system query telemetry history beyond this 200-row view, query the backend database directly using:
                  <code style={{ display: 'block', marginTop: '6px', padding: '6px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    SELECT * FROM execution_log ORDER BY recorded_at DESC;
                  </code>
                </div>
              </div>
            </div>
          )}
          </>
        )}

        {activeAdminTab === 'rbac' && (
          <>
            {adminError && <div className="auth-error-banner">{adminError}</div>}
            {adminSuccess && <div className="auth-error-banner" style={{backgroundColor: '#E8F5E9', color: '#2E7D32', borderColor: '#C8E6C9'}}>{adminSuccess}</div>}

            {/* User List & Elevation Card */}
          <div className="admin-card">
            <h3 className="admin-card-title">User Directory</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Username</th>
                    <th>Access Type</th>
                    <th>Mapped Roles</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                   {adminUsers.slice((userDirectoryPage - 1) * 20, userDirectoryPage * 20).map((u) => (
                     <tr key={u.user_id}>
                       <td>{u.user_id}</td>
                       <td><b>{u.user_name}</b></td>
                       <td>
                         <span className={`admin-badge ${u.access_type.toLowerCase()}`}>
                           {u.access_type}
                         </span>
                       </td>
                       <td>
                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                           {u.roles.map(r => (
                             <span 
                               key={r.role_id} 
                               style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid #ddd', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                             >
                               {r.role_name}
                               <button 
                                 style={{ border: 'none', background: 'transparent', color: 'grey', cursor: 'pointer', fontWeight: 'bold' }}
                                 onClick={() => handleUnmapUserRole(u.user_id, r.role_id)}
                               >
                                 &times;
                               </button>
                             </span>
                           ))}
                           {u.roles.length === 0 && <span style={{color: 'grey', fontSize: '12px'}}>None</span>}
                         </div>
                       </td>
                       <td>{new Date(u.created_at).toLocaleDateString()}</td>
                       <td className="admin-actions-cell">
                         {u.access_type === 'User' ? (
                           <button 
                             className="admin-action-btn-sm" 
                             style={{color: '#1565C0'}}
                             onClick={() => handleElevateUser(u.user_id, 'Admin')}
                           >
                             Promote to Admin
                           </button>
                         ) : (
                           <button 
                             className="admin-action-btn-sm" 
                             style={{color: '#D32F2F'}}
                             onClick={() => handleElevateUser(u.user_id, 'User')}
                             disabled={u.user_name === user.username} // Prevents self-demotion
                           >
                             Demote to User
                           </button>
                         )}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>

             {/* User Directory Pagination Controls */}
             {adminUsers.length > 20 && (
               <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                 <button 
                   className="btn-secondary" 
                   style={{ padding: '4px 10px', fontSize: '12px' }}
                   disabled={userDirectoryPage === 1}
                   onClick={() => setUserDirectoryPage(p => p - 1)}
                 >
                   ◀ Previous
                 </button>
                 <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
                   Page {userDirectoryPage} of {Math.ceil(adminUsers.length / 20)}
                 </span>
                 <button 
                   className="btn-secondary" 
                   style={{ padding: '4px 10px', fontSize: '12px' }}
                   disabled={userDirectoryPage >= Math.ceil(adminUsers.length / 20)}
                   onClick={() => setUserDirectoryPage(p => p + 1)}
                 >
                   Next ▶
                 </button>
               </div>
             )}
           </div>

          {/* Dual Mappings Forms Grid */}
          <div className="admin-grid-two">
            {/* User to Role Mapping */}
            <div className="admin-card">
              <h3 className="admin-card-title">Assign User to Role</h3>
              <form onSubmit={handleMapUserRole} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Select User</label>
                  <select 
                    className="form-input" 
                    value={mapUserId} 
                    onChange={e => setMapUserId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose User --</option>
                    {adminUsers.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.user_name} ({u.access_type})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Select Role</label>
                  <select 
                    className="form-input" 
                    value={mapRoleId} 
                    onChange={e => setMapRoleId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Role --</option>
                    {adminRoles.map(r => (
                      <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-primary-action">Map User to Role</button>
              </form>
            </div>

            {/* Role to Rule Mapping */}
            <div className="admin-card">
              <h3 className="admin-card-title">Map Role to Restriction Rule</h3>
              <form onSubmit={handleMapRoleRule} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Select Role</label>
                  <select 
                    className="form-input" 
                    value={mapRoleId} 
                    onChange={e => setMapRoleId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Role --</option>
                    {adminRoles.map(r => (
                      <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Select Rule</label>
                  <select 
                    className="form-input" 
                    value={mapRuleId} 
                    onChange={e => setMapRuleId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Rule --</option>
                    {adminRules.map(ru => (
                      <option key={ru.rule_id} value={ru.rule_id}>{ru.rule_name} (Predicate: {ru.sql_predicate})</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-primary-action">Map Role to Rule</button>
              </form>
            </div>
          </div>

          {/* Creation Cards Grid */}
          <div className="admin-grid-two">
            {/* Create Role */}
            <div className="admin-card">
              <h3 className="admin-card-title">Create New Role</h3>
              <form onSubmit={handleCreateRole} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Role Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. US_Sales_Agent"
                    value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Brief role summary..."
                    value={newRoleDesc}
                    onChange={e => setNewRoleDesc(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary-action">Create Role</button>
              </form>
            </div>

            {/* Create Rule */}
            <div className="admin-card">
              <h3 className="admin-card-title">Create New Restriction Rule</h3>
              <form onSubmit={handleCreateRule} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Rule Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. US_Only"
                    value={newRuleName}
                    onChange={e => setNewRuleName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Filters rows to US region"
                    value={newRuleDesc}
                    onChange={e => setNewRuleDesc(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">SQL Predicate Clause</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. geographic_region = 'US'"
                    value={newRulePredicate}
                    onChange={e => setNewRulePredicate(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary-action">Create Rule</button>
              </form>
            </div>
          </div>

           {/* Roles & Rules Mappings Directory Table */}
           <div className="admin-card">
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
               <h3 className="admin-card-title" style={{ margin: '0' }}>Active Role Configurations</h3>
               <input 
                 type="text" 
                 placeholder="Search roles or descriptions..." 
                 value={roleSearchQuery}
                 onChange={e => setRoleSearchQuery(e.target.value)}
                 style={{
                   padding: '6px 12px',
                   borderRadius: '6px',
                   border: '1px solid var(--border-color)',
                   backgroundColor: 'var(--bg-secondary)',
                   color: 'var(--text-primary)',
                   fontSize: '13px',
                   width: '240px'
                 }}
               />
             </div>
             <div className="table-container">
               <table>
                 <thead>
                   <tr>
                     <th>Role ID</th>
                     <th>Role Name</th>
                     <th>Description</th>
                     <th>Mapped Rules (SQL Predicate Constraints)</th>
                   </tr>
                 </thead>
                 <tbody>
                   {adminRoles.filter(r => {
                     const query = roleSearchQuery.toLowerCase();
                     return r.role_name.toLowerCase().includes(query) || (r.description || '').toLowerCase().includes(query);
                   }).map((r) => (
                    <tr key={r.role_id}>
                      <td>{r.role_id}</td>
                      <td><b>{r.role_name}</b></td>
                      <td>{r.description || <span style={{color: 'grey'}}>None</span>}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {r.rules.map(ru => (
                            <span 
                              key={ru.rule_id} 
                              style={{ background: '#FFFDE7', border: '1px solid #FFF59D', color: '#F57F17', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <code>{ru.sql_predicate}</code>
                              <button 
                                style={{ border: 'none', background: 'transparent', color: '#F57F17', cursor: 'pointer', fontWeight: 'bold' }}
                                onClick={() => handleUnmapRoleRule(r.role_id, ru.rule_id)}
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                          {r.rules.length === 0 && <span style={{color: 'grey', fontSize: '12px'}}>No restrictions active (Global access)</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        {activeAdminTab === 'model' && (
          <div style={{ marginTop: '20px' }}>
            {/* Warning / Banner */}
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#FFFDE7',
              border: '1px solid #FFF59D',
              borderRadius: '8px',
              color: '#F57F17',
              fontSize: '13px',
              fontWeight: '500',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⚠️</span>
              <span>
                <b>Read-Only Data Model View:</b> To modify the schema, please edit the system database configuration files (e.g. <code>init.sql</code> or <code>db_schema_mapping.json</code>).
              </span>
            </div>

            {/* Interactive Controls & Viewport Card */}
            <div className="admin-card" style={{ padding: '0', overflow: 'hidden', position: 'relative', height: '600px', display: 'flex', flexDirection: 'column' }}>
              {/* Canvas Controls Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 20px',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0' }}>Interactive Relationship Map</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '4px 12px', fontSize: '12px' }}
                    onClick={() => setZoom(z => Math.min(z + 0.1, 2))}
                  >
                    Zoom In (+)
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '4px 12px', fontSize: '12px' }}
                    onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))}
                  >
                    Zoom Out (-)
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '4px 12px', fontSize: '12px' }}
                    onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                  >
                    Reset View ↺
                  </button>
                </div>
              </div>

              {/* Interactive Canvas Viewport */}
              <div 
                style={{
                  flexGrow: 1,
                  position: 'relative',
                  overflow: 'hidden',
                  backgroundColor: 'var(--bg-canvas, #F9FAFB)',
                  cursor: isDragging ? 'grabbing' : 'grab'
                }}
                onMouseDown={handleERMouseDown}
                onMouseMove={handleERMouseMove}
                onMouseUp={handleERMouseUp}
                onMouseLeave={handleERMouseUp}
              >
                {!adminSchema ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'grey' }}>
                    <span>Loading schema model mapping...</span>
                  </div>
                ) : (
                  (() => {
                    const tables = adminSchema.database_tables || [];
                    const N = tables.length;
                    const cardWidth = 190;
                    const cardHeight = 100;
                    
                    // Compute circular layouts automatically
                    const positions = {};
                    tables.forEach((t, i) => {
                      const theta = (2 * Math.PI * i) / N;
                      // Center of canvas: X=450, Y=250. Elliptical radius: RX=280, RY=160
                      positions[t.table_name] = {
                        x: 450 + 280 * Math.cos(theta),
                        y: 250 + 160 * Math.sin(theta)
                      };
                    });

                    const relationships = getERRelationships(tables);

                    return (
                      <svg 
                        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                      >
                        <defs>
                          <marker 
                            id="er-arrow" 
                            viewBox="0 0 10 10" 
                            refX="16" 
                            refY="5" 
                            markerWidth="6" 
                            markerHeight="6" 
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--btn-primary, #2563eb)" />
                          </marker>
                        </defs>

                        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ pointerEvents: 'auto' }}>
                          {/* Draw Relationship Lines */}
                          {relationships.map((rel, idx) => {
                            const source = positions[rel.sourceTable];
                            const target = positions[rel.targetTable];
                            if (!source || !target) return null;
                            return (
                              <line
                                key={`edge-${idx}`}
                                x1={source.x}
                                y1={source.y}
                                x2={target.x}
                                y2={target.y}
                                stroke="var(--btn-primary, #2563eb)"
                                strokeWidth="2"
                                opacity="0.6"
                                markerEnd="url(#er-arrow)"
                              />
                            );
                          })}

                          {/* Draw Tables */}
                          {tables.map((table) => {
                            const pos = positions[table.table_name];
                            if (!pos) return null;
                            const filteredCols = getFilteredColumns(table);

                            return (
                              <foreignObject
                                key={table.table_name}
                                x={pos.x - cardWidth / 2}
                                y={pos.y - cardHeight / 2}
                                width={cardWidth}
                                height={180}
                                style={{ overflow: 'visible' }}
                              >
                                <div 
                                  className="er-card"
                                  style={{
                                    backgroundColor: 'var(--bg-secondary)',
                                    border: '1.5px solid var(--border-color)',
                                    borderRadius: '8px',
                                    boxShadow: 'var(--shadow-sm)',
                                    width: `${cardWidth}px`,
                                    overflow: 'hidden',
                                    fontFamily: 'inherit'
                                  }}
                                >
                                  {/* Header */}
                                  <div style={{
                                    backgroundColor: '#1E293B',
                                    color: '#FFFFFF',
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    textAlign: 'center',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                  }}>
                                    {table.table_name}
                                  </div>
                                  
                                  {/* Columns List */}
                                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {filteredCols.map(col => (
                                      <div 
                                        key={col.name} 
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          fontSize: '11px',
                                          color: 'var(--text-primary)'
                                        }}
                                      >
                                        <span style={{
                                          fontSize: '8px',
                                          fontWeight: 'bold',
                                          padding: '1px 3px',
                                          borderRadius: '3px',
                                          backgroundColor: col.isPK ? '#E3F2FD' : '#E8F5E9',
                                          color: col.isPK ? '#0D47A1' : '#1B5E20',
                                          border: col.isPK ? '1px solid #BBDEFB' : '1px solid #C8E6C9'
                                        }}>
                                          {col.isPK ? 'PK' : 'FK'}
                                        </span>
                                        <span style={{ fontWeight: '600', flexGrow: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={col.name}>
                                          {col.name}
                                        </span>
                                        <span style={{ color: 'grey', fontSize: '9px' }}>
                                          {col.type.toLowerCase()}
                                        </span>
                                      </div>
                                    ))}
                                    {filteredCols.length === 0 && (
                                      <span style={{ fontSize: '11px', color: 'grey', fontStyle: 'italic', textAlign: 'center' }}>
                                        No Keys Found
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </foreignObject>
                            );
                          })}
                        </g>
                      </svg>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        )}

        {activeAdminTab === 'model_settings' && (
          <div style={{ marginTop: '20px' }}>
            {/* Warning / Banner */}
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#E8F5E9',
              border: '1px solid #C8E6C9',
              borderRadius: '8px',
              color: '#2E7D32',
              fontSize: '13px',
              fontWeight: '500',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⚙️</span>
              <span>
                <b>Model Settings:</b> To change the active LLM provider or switch the Gemini model parameters, edit the configuration profile (<code>llm_config.yaml</code>) inside the backend repository.
              </span>
            </div>

            {/* Models Configuration Table Card */}
            <div className="admin-card">
              <h3 className="admin-card-title" style={{ marginBottom: '16px' }}>Available LLM Integration Pipelines</h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Pipeline/Provider ID</th>
                      <th>Display Name</th>
                      <th>Integration Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {llmStatus?.available_models.map((model) => (
                      <tr key={model.name}>
                        <td><code>{model.name}</code></td>
                        <td><b>{model.friendly_name}</b></td>
                        <td>
                          <span className="admin-badge" style={{
                            backgroundColor: model.active ? '#E8F5E9' : 'rgba(0,0,0,0.05)',
                            color: model.active ? '#2E7D32' : 'grey',
                            borderColor: model.active ? '#C8E6C9' : '#ddd',
                            border: '1px solid',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600'
                          }}>
                            {model.active ? '● Active Connection' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!llmStatus && (
                      <tr>
                        <td colSpan="3" style={{ textAlign: 'center', color: 'grey', padding: '20px' }}>
                          Loading LLM pipelines configurations status...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* 5. SENTIMENT FEEDBACK OVERLAY DIALOG MODAL */}
      {feedbackOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Submit Response Feedback</h3>
              <button className="modal-close-btn" onClick={() => setFeedbackOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="form-group" style={{ fontSize: '13px', color: 'grey' }}>
              <p>You are submitting <b>{feedbackItem?.thumbs_up ? 'Positive (Thumbs Up)' : 'Negative (Thumbs Down)'}</b> feedback for the response.</p>
            </div>

            <div className="form-group">
              <label className="form-label">Optional Comments</label>
              <textarea 
                className="form-input" 
                style={{ minHeight: '80px', fontFamily: 'inherit' }}
                placeholder="What did you like or dislike about this response? (e.g. incorrect sum, perfect markdown table...)"
                value={feedbackComment}
                onChange={e => setFeedbackComment(e.target.value)}
              />
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setFeedbackOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary-action" onClick={submitFeedback}>
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
