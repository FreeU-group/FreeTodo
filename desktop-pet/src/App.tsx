import { useEffect, useState } from 'react';
import logo from './logo.png';

type WindowMode = 'ball' | 'panel';

interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'lifetrace-desktop-pet-todos';

function App() {
  const [mode, setMode] = useState<WindowMode>('ball');
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');

  // 从本地存储加载任务
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Todo[];
        setTodos(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // 持久化任务列表
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch {
      // ignore
    }
  }, [todos]);

  const syncWindowMode = (nextMode: WindowMode) => {
    setMode(nextMode);
    if (window.electronAPI?.setWindowMode) {
      window.electronAPI.setWindowMode(nextMode);
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.closeApp) {
      window.electronAPI.closeApp();
    }
  };

  const handleMouseDown = () => {
    setIsPressed(true);
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsPressed(false);
  };

  const handleTogglePanel = () => {
    const nextMode: WindowMode = mode === 'ball' ? 'panel' : 'ball';
    syncWindowMode(nextMode);
  };

  const handleAddTodo = () => {
    const title = newTitle.trim();
    if (!title) return;

    const todo: Todo = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      done: false,
      createdAt: Date.now(),
    };

    setTodos((prev) => [todo, ...prev]);
    setNewTitle('');
  };

  const handleToggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  const handleDeleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const handleEditTodo = (id: string) => {
    const target = todos.find((t) => t.id === id);
    if (!target) return;
    const nextTitle = window.prompt('编辑任务标题', target.title);
    if (nextTitle === null) return;
    const trimmed = nextTitle.trim();
    if (!trimmed) return;
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)),
    );
  };

  if (mode === 'panel') {
    return (
      <div className="panel-root">
        <div className="panel-card">
          <header className="panel-header">
            <div className="panel-title">
              <img src={logo} alt="LifeTrace" className="panel-logo" />
              <div>
                <div className="panel-title-main">日程管理</div>
                <div className="panel-title-sub">今天想完成些什么？</div>
              </div>
            </div>
            <div className="panel-actions">
              <button
                className="panel-icon-button"
                onClick={handleTogglePanel}
                title="收起为悬浮球"
              >
                ⬇
              </button>
              <button
                className="panel-icon-button danger"
                onClick={handleClose}
                title="关闭应用"
              >
                ×
              </button>
            </div>
          </header>

          <main className="panel-body">
            <div className="todo-input-row">
              <input
                className="todo-input"
                placeholder="输入要做的事情，按回车或点击添加"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddTodo();
                  }
                }}
              />
              <button className="todo-add-button" onClick={handleAddTodo}>
                添加
              </button>
            </div>

            <ul className="todo-list">
              {todos.length === 0 && (
                <li className="todo-empty">还没有任务，先添加一个吧。</li>
              )}
              {todos.map((todo) => (
                <li key={todo.id} className="todo-item">
                  <label className="todo-main">
                    <input
                      type="checkbox"
                      checked={todo.done}
                      onChange={() => handleToggleTodo(todo.id)}
                    />
                    <span className={todo.done ? 'todo-title done' : 'todo-title'}>
                      {todo.title}
                    </span>
                  </label>
                  <div className="todo-actions">
                    <button
                      className="todo-action-button"
                      onClick={() => handleEditTodo(todo.id)}
                    >
                      编辑
                    </button>
                    <button
                      className="todo-action-button danger"
                      onClick={() => handleDeleteTodo(todo.id)}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </main>
        </div>
      </div>
    );
  }

  // 悬浮球模式
  return (
    <div
      className="app-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div
        className={`floating-ball ${isHovered ? 'hovered' : ''} ${
          isPressed ? 'pressed' : ''
        }`}
        onClick={handleTogglePanel}
      >
        <img
          src={logo}
          alt="LifeTrace"
          className="logo"
          draggable={false}
        />
        {isHovered && (
          <button
            className="close-button"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="关闭"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export default App;


