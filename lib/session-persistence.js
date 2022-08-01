const SeedData = require("./seed-data");
const deepCopy = require("./deep-copy");
const { sortTodos, sortTodoLists } = require("./sort");
const nextId = require("./next-id");

module.exports = class SessionPersistence {
  constructor(session) {
  	this._todoLists = session.todoLists || deepCopy(SeedData);
  	session.todoLists = this._todoLists;
  }

  sortedTodoLists() {
  	let todoLists = deepCopy(this._todoLists); // force a copy to be sent over 
  	let undone = todoLists.filter(todoList => !this.isDoneTodoList(todoList));
    let done = todoLists.filter(todoList => this.isDoneTodoList(todoList));
  	return sortTodoLists(undone, done);
  }

  sortedTodos(todoList) {
  	let todos = deepCopy(todoList.todos);
  	let undone = todos.filter(todo => !todo.done);
    let done = todos.filter(todo => todo.done);
    return sortTodos(undone, done);
  }

  isDoneTodoList(todoList) {
  	return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  loadTodoList(todoListId) {
  	let todoList = this._findTodoList(todoListId);
  	return deepCopy(todoList);
  }

  loadTodo(todoListId, todoId) {
  	let todo = this._findTodo(todoListId, todoId);
  	return deepCopy(todo);
  }

  toggleTodo(todoListId, todoId) {
  	let todo = this._findTodo(todoListId, todoId);
  	if (!todo) return false;
  	todo.done = !todo.done;
  	return true;
  }

  markAllTodosDone(todoListId) {
  	let todoList = this._findTodoList(todoListId);
  	if (!todoList) return false;
  	todoList.todos.forEach(todo => todo.done = true);
  	return true;
  }

  deleteTodo(todoListId, todoId) {
  	let todoList = this._findTodoList(todoListId);
  	if (!todoList) return false;

  	let todo = this._findTodo(todoListId, todoId);
  	if (!todo) return false;

  	let index = todoList.todos.indexOf(todo);
  	if (index < 0) return false;

  	todoList.todos.splice(index, 1);
  	return true;
  }

  _findTodoList(todoListId) {
  	return this._todoLists.find(todoList => todoList.id === todoListId);
  }

  _findTodo(todoListId, todoId) {
  	let todoList = this._findTodoList(todoListId);
  	return todoList.todos.find(todo => todo.id === todoId);
  }

  makeNewTodo(title) {
  	return {
  	  id: nextId(),
  	  title,
  	  done: false,
  	}
  }

  add(todoListId, title) {
  	let todo = this.makeNewTodo(title);
  	let todoList = this._findTodoList(todoListId);
  	if (!todoList) return false;
  	todoList.todos.push(todo);
  	return true;
  }

  addTodoList(title) {
  	this._todoLists.push({
  	  id: nextId(),
  	  title, 
  	  todos: [],
  	});
  	return true;
  }

  destroyTodoList(todoListId) {
  	let todoList = this._findTodoList(todoListId);
  	if (!todoList) return false;
  	let index = this._todoLists.indexOf(todoList);
  	if (index === -1) return false;
  	this._todoLists.splice(index, 1);
  	return true;
  }

  setTitle(todoListId, title) {
  	let todoList = this._findTodoList(todoListId);
  	if (!todoList) return false;
  	todoList.title = title;
  	return true;
  }

  isTodoListTitleUnique(title) {
  	return !this._todoLists.some(todoList => todoList.title === title);
  }

  isUniqueConstraintViolation(err) {
    return false;
  }

};

