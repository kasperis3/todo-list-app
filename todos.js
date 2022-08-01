const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const catchError = require("./lib/catch-error");

const PgPersistence = require("./lib/pg-persistence");
// const store = require("connect-loki");
// const SessionPersistence = require("./lib/session-persistence");


const app = express();
const host = "localhost";
const port = 3002;
// const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in millseconds
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  // store: new LokiStore({}),
}));

app.use(flash());

// Create a new datastore
app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});

// Extract session info
app.use((req, res, next) => {
  res.locals.username = req.session.username; // pass variables between middleware functions with res.locals... 
  res.locals.signedIn = req.session.signedIn;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

const requiresAuthorization = (req, res, next) => {
  // console.log(req.session);
  // console.log(res.locals);
  if (!res.locals.signedIn) {
    res.redirect(302, "/users/signin");
    // res.status(404).send("Unauthorized");
  } else {
    next();
  }
};

// Redirect start page
app.get("/", 
  (req, res) => {
    res.redirect("/lists");
  }
);

// Render the list of todo lists
app.get("/lists", 
  requiresAuthorization,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let todoLists = await store.sortedTodoLists();
    let todosInfo = todoLists.map(todoList => ({
      countAllTodos: todoList.todos.length,
      countDoneTodos: todoList.todos.filter(todo => todo.done).length,
      isDone: store.isDoneTodoList(todoList),
    }));

    res.render("lists", {
      todoLists,
      todosInfo,
    });
  })
);

// Render new todo list page
app.get("/lists/new", 
  requiresAuthorization,
  (req, res) => {
    res.render("new-list", {
  });
});

// Create a new todo list
app.post("/lists",
  requiresAuthorization,
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;
    let todoListTitle = req.body.todoListTitle;

    const rerenderNewList = () => {
      res.render("new-list", {
        flash: req.flash(),
        todoListTitle: req.body.todoListTitle,
      });
    }

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      rerenderNewList();
    } else if (await store.existsTodoListTitle(todoListTitle)) {
      req.flash("error", "List title must be unique");
      rerenderNewList();
    } else {
      let created = await store.addTodoList(todoListTitle);
      if (!created) {
        req.flash("error", "Title is not unique");
        rerenderNewList();
      } else {
        req.flash("success", "The todo list has been created.");
        res.redirect("/lists");  
      }
    }
  })
);

// Render individual todo list and its todos
app.get("/lists/:todoListId", 
  requiresAuthorization, 
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let store = res.locals.store;
    let todoList = await store.loadTodoList(+todoListId);
    if (!todoList) throw new Error("Not found");
    todoList.todos = await store.sortedTodos(todoList);
    res.render("list", {
      todoList,
      isDoneTodoList: store.isDoneTodoList(todoList),
    });
  })
);


// Toggle completion status of a todo
app.post("/lists/:todoListId/todos/:todoId/toggle", 
  requiresAuthorization,
  catchError (async (req, res) => {
    let { todoListId, todoId } = { ...req.params };
  
    let toggled = res.locals.store.toggleTodo(+todoListId, +todoId);
    if (!toggled) throw new Error("Not found.");
    let todo = await res.locals.store.loadTodo(+todoListId, +todoId);
    console.log(todo);
    let title = todo.title;
    if (todo.done) {
      req.flash("success", `"${title}" marked as NOT done!`);
    } else {
      req.flash("success", `"${title}" marked done.`);
    }
    res.redirect(`/lists/${todoListId}`);
  })
);

// Delete a todo
app.post("/lists/:todoListId/todos/:todoId/destroy", 
  requiresAuthorization,
  catchError(async (req, res) => {
    let { todoListId, todoId } = { ...req.params };
    let store = res.locals.store;
    let deleted = await store.deleteTodo(+todoListId, +todoId);
    if (!deleted) throw new Error("Not found.");

    req.flash("success", "The todo has been deleted.");
    res.redirect(`/lists/${todoListId}`);
  })
);

// Mark all todos as done
app.post("/lists/:todoListId/complete_all", 
  requiresAuthorization,
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
  
    let markedAllTodosDone = await res.locals.store.markAllTodosDone(+todoListId);
    if (!markedAllTodosDone) throw new Error("Not found.");
  
    req.flash("success", "All todos have been marked as done.");
    res.redirect(`/lists/${todoListId}`);
  })
);

// Create a new todo and add it to the specified list
app.post("/lists/:todoListId/todos",
  requiresAuthorization,
  [
    body("todoTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The todo title is required.")
      .isLength({ max: 100 })
      .withMessage("Todo title must be between 1 and 100 characters."),
  ],
  catchError(async (req,res) => {
    let todoListId = req.params.todoListId;
    let store = res.locals.store;
    let todoList = await store.loadTodoList(+todoListId);
    if (!todoList) throw new Error("Not found.");
    
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      todoList.todos = await store.sortedTodos(todoList);
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("list", {
        flash: req.flash(),
        todoList,
        isDoneTodoList: store.isDoneTodoList(todoList),
        todoTitle: req.body.todoTitle,
      });
    } else {
      let created = await store.add(+todoListId, req.body.todoTitle);
      if (!created) throw new Error("Not found");

      req.flash("success", "The todo has been created.");
      res.redirect(`/lists/${todoListId}`);
    } 
  })
);

// Render edit todo list form
app.get("/lists/:todoListId/edit", 
  requiresAuthorization,
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let todoList = await res.locals.store.loadTodoList(+todoListId);
    if (!todoList) throw new Error("Not found.");

    res.render("edit-list", { 
      todoList,
    });
  })
);

// Delete todo list
app.post("/lists/:todoListId/destroy", 
  requiresAuthorization,
  catchError(async (req, res) => {
    let todoListId = +req.params.todoListId;
    let destroyed = await res.locals.store.destroyTodoList(+todoListId);
    if (!destroyed) throw new Error("Not found.");
  
    req.flash("success", "Todo list deleted.");
    res.redirect("/lists");
  })
);

// Edit todo list title
app.post("/lists/:todoListId/edit",
  requiresAuthorization,
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
  ],
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let todoListTitle = req.body.todoListTitle;
    let store = res.locals.store;

    const rerenderEditList = async () => {
      let todoList = await store.loadTodoList(+todoListId);
      if (!todoList) throw new Error("Not found");

      res.render("edit-list", {
        flash: req.flash(),
        todoListTitle, 
        todoList,
      });
    };

    try {
      let errors = validationResult(req);

      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));
        await rerenderEditList();
      } else if (await store.existsTodoListTitle(todoListTitle)) {
        req.flash("error", "List title must be unique");
        await rerenderEditList();
      } else {
        let updated = await store.setTitle(+todoListId, todoListTitle);
        if (!updated) throw new Error("Not found");

        req.flash("success", "Todo list updated.");
        res.redirect(`/lists/${todoListId}`);
      }
    } catch(err) {
      if (store.isUniqueConstraintViolation(err)) {
        req.flash("error", "Title must be unique");
        rerenderEditList();
      } else {
        throw error;
      }
    }
    
  })
);

app.get("/users/signin", 
  catchError(async (req, res) => {
    req.flash("info", "Please sign in.");
    res.render("signin", {
      flash: req.flash(),
    });
  })
);

app.post("/users/signin",
  catchError(async (req, res) => {
    let username = req.body.username.trim();
    let password = req.body.password;
    let store = res.locals.store;

    if (await store.acceptsLoginCredentials(username, password)) {
      req.flash("info", "Welcome!");
      req.session.username = username;
      req.session.signedIn = true;
      res.redirect("/lists");
    } else {
      req.flash("error", "Invalid credentials");
      res.render("signin", {
        flash: req.flash(), 
        username,
      });
    }
  })
);

app.post("/users/signout", 
  catchError(async (req, res) => {
    delete req.session.username;
    delete req.session.signedIn;
    res.redirect("/users/signin");
  })
);

// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

// Listener
app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});
