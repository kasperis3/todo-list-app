// const SeedData = require("./seed-data");
// const deepCopy = require("./deep-copy");
// const { sortTodos, sortTodoLists } = require("./sort");
// const nextId = require("./next-id");

// const { Client } = require('pg');

const { dbQuery } = require("./db-query");
const bcrypt = require("bcrypt");

module.exports = class PgPersistence {

  constructor(session) {
    this.username = session.username;
  }

  async sortedTodoLists() {
    const ALL_TODOLISTS = 'SELECT * FROM todolists WHERE username = $1 ORDER BY lower(title) ASC';
    const ALL_TODOS = 'SELECT * FROM todos WHERE username = $1';

    let resultTodoLists = dbQuery(ALL_TODOLISTS, this.username);
    let resultTodos = dbQuery(ALL_TODOS, this.username);

    let resultBoth = await Promise.all([resultTodoLists, resultTodos]);

    let allTodoLists = resultBoth[0].rows;
    let allTodos = resultBoth[1].rows;

    if (!allTodoLists || !allTodos) return undefined;

    allTodoLists.forEach(todoList => {
      todoList.todos = allTodos.filter(todo => {
        return todoList.id === todo.id;
      });
    });

    return this._partitionTodoLists(allTodoLists);
  }

  _partitionTodoLists(todoLists) {
    let done = [];
    let undone = [];

    todoLists.forEach(todoList => {
      if (this.isDoneTodoList(todoList)) {
        done.push(todoList);
      } else {
        undone.push(todoList);
      }
    });

    return [].concat(undone, done);
  }


  async sortedTodos(todoList) {
   const ALL_TODOS = 'SELECT * FROM todos WHERE todolist_id = $1 AND username = $2 ORDER BY done ASC, lower(title) ASC';

   let result = await dbQuery(ALL_TODOS, todoList.id, this.username);
   let todos = result.rows;

   return todos;
  }

  isDoneTodoList(todoList) {
  	return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }

  async loadTodoList(todoListId) {
    const TODO_LIST = 'SELECT * FROM todolists WHERE id = $1 AND username = $2';
    const TODOS = 'SELECT * FROM todos WHERE todolist_id = $1 AND username = $2'; 

    let resultTodoList = dbQuery(TODO_LIST, todoListId, this.username);
    let resultTodos = dbQuery(TODOS, todoListId, this.username);
    let resultBoth = await Promise.all([resultTodoList, resultTodos]);

    let todoList = resultBoth[0].rows[0];
    if (!todoList) return undefined;

    todoList.todos = resultBoth[1].rows;
    return todoList;
  }

  async loadTodo(todoListId, todoId) {
    const TODO = 'SELECT * FROM todos WHERE id = $1 AND todolist_id = $2 AND username = $3';

    let result = await dbQuery(TODO, todoId, todoListId, this.username);

    return result.rows[0];
  }

  async toggleTodo(todoListId, todoId) {

    const TOGGLE_TODO = 'UPDATE todos SET done = NOT done WHERE id = $1 AND todolist_id = $2 AND username = $3';
    let result = await dbQuery(TOGGLE_TODO, todoId, todoListId, this.username);
    return result.rowCount > 0;
  }

  async markAllTodosDone(todoListId) {
    const TODOS = 'UPDATE todos SET done = true WHERE todolist_id = $1 AND username = $2';

    let result = await dbQuery(TODOS, todoListId, this.username);

    return result.rowCount > 0;
  }

  async deleteTodo(todoListId, todoId) {

    const TODO = 'DELETE FROM todos WHERE id = $1 and todolist_id = $2 AND username = $3';

    let result = await dbQuery(TODO, todoId, todoListId, this.username);

    return result.rowCount > 0;


  }

  async add(todoListId, title) {
  	// let todo = this.makeNewTodo(title);
  	// let todoList = this._findTodoList(todoListId);
  	// if (!todoList) return false;
  	// todoList.todos.push(todo);
  	// return true;
    const ADD_TODO = 'INSERT INTO todos (title, todolist_id, username) VALUES ($2, $1, $3)';

    let result = await dbQuery(ADD_TODO, todoListId, title, this.username);

    return result.rowCount > 0;

  }

  async addTodoList(title) {
    const ADD_TODOLIST = 'INSERT INTO todolists (title, username) VALUES ($1, $2)';

    try {
      let result = await dbQuery(ADD_TODOLIST, title, this.username);
      return result.rowCount > 0;
    } catch(err) {
      if (this.isUniqueConstraintViolation(err)) return false;
      throw err;
    }

    
  }

  async destroyTodoList(todoListId) {

    const REMOVE_TODOLIST = 'DELETE FROM todolists WHERE id = $1 AND username = $2'; // on delete cascade will take care of the todos table
    console.log(todoListId);
    let result = await dbQuery(REMOVE_TODOLIST, todoListId, this.username);

    return result.rowCount > 0;

  }

  async setTitle(todoListId, title) {

    const UPDATE_TITLE = 'UPDATE todolists SET title = $1 WHERE id = $2 AND username = $3';

    let result = await dbQuery(UPDATE_TITLE, title, todoListId, this.username);

    return result.rowCount > 0;

  }

  async existsTodoListTitle(title) {
    const TITLES = 'SELECT null FROM todolists WHERE title = $1 AND username = $2';

    let result = await dbQuery(TITLES, title, this.username);

    return result.rowCount > 0;

  }

  isUniqueConstraintViolation(error) {
    return /duplicate key value violates unique constraint/.test(String(error));
  }

  async acceptsLoginCredentials(username, password) {
    const USER_PASS = 'SELECT password FROM users WHERE username=$1';

    let result = await dbQuery(USER_PASS, username);

    if (result.rowCount === 0) return false;

    return bcrypt.compare(password, result.rows[0].password);
  }

};

