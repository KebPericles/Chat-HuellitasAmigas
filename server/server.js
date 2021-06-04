const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const mysql = require('mysql');

//MySQL details
var mysqlConnection = mysql.createConnection({
    host: 'localhost',
    user: 'elremoto',
    password: 'N0m3l0merks!',
    database: 'HuellitasAmigas',
    multipleStatements: true
});

const { generateMessage, generateLocationMessage } = require('./utils/message');
const { isRealString } = require('./utils/isRealString');
const { Users } = require('./utils/users');

const publicPath = path.join(__dirname, '/../public');
const port = process.env.PORT || 3000
let app = express();
let server = http.createServer(app);
let io = socketIO(server);
let users = new Users();

app.use(express.static(publicPath));

io.on('connection', (socket) => {
    console.log("A new user just connected");

    //Se une un usuario a un room por su idUsuario, idChat y 
    socket.on('join', (params, callback) => {
        if (!isRealString(params.idUsuario) || !isRealString(params.room)) {
            return callback('Name and room are required');
        }

        mysqlConnection.query("SELECT * FROM CatalogoChat WHERE idChat = ? AND bloqueado = false;", params.room, (err2, rows, field) => {
            if (!err2 && rows.length == 1) {
                console.log(rows[0])
                var idUsuario1 = rows[0].idUsuario1;
                var idUsuario2 = rows[0].idUsuario2;
                if (params.idUsuario == idUsuario1 || params.idUsuario == idUsuario2) {

                    socket.join(params.room);
                    users.removeUser(socket.id);
                    if (params.idUsuario == idUsuario1) {
                        users.addUser(socket.id, params.idUsuario, params.room, true);
                    } else {
                        users.addUser(socket.id, params.idUsuario, params.room, false);
                    }


                    io.to(params.room).emit('updateUsersList', users.getUserList(params.room));
                    socket.emit('newMessage', generateMessage('Admin', `Welocome to ${params.room}!`));

                    socket.broadcast.to(params.room).emit('newMessage', generateMessage('Admin', "New User Joined!"));

                    callback();
                } else {
                    return;
                }
            } else {
                console.log(err2);
            }
        });
    })

    //Nuevo mensaje en el chat
    socket.on('createMessage', (message, callback) => {
        let user = users.getUser(socket.id);

        //Guardar msj en la bd
        //validar usuario
        if (user && isRealString(message.text)) {
            //ver de que usuario proviene e insertar el msj en la bd
            console.log("mensaje");
            if (user.user1) {
                mysqlConnection.query("INSERT INTO MensajeChat(idChat, usuario1, mensaje) VALUES(?, true, ?);", [user.name, message.text], (err, rows, field) => {
                    if (!err)
                        io.to(user.room).emit('newMessage', generateMessage(user.name, message.text));
                    else
                        console.log(err);
                });
            } else if (!user.user1) {
                mysql.query("INSERT INTO MensajeChat(idChat, usuario1, mensaje) VALUES(" + user.room + ", false, ?);", [message.text], (err, rows, field) => {
                    if (!err)
                        io.to(user.room).emit('newMessage', generateMessage(user.name, message.text));
                    else
                        console.log(err);
                });
            } else {
                return;
            }
        }
        callback('This is the server:');
    })

    socket.on('createLocationMessage', (coords) => {
        let user = users.getUser(socket.id);

        if (user) {
            io.to(user.room).emit('newLocationMessage', generateLocationMessage(user.name, coords.lat, coords.lng))
        }
    })

    socket.on('disconnect', () => {
        let user = users.removeUser(socket.id);

        if (user) {
            io.to(user.room).emit('updateUsersList', users.getUserList(user.room));
            io.to(user.room).emit('newMessage', generateMessage('Admin', `${user.name} has left ${user.room} chat room.`))
        }
    });
});

server.listen(port, () => {
    console.log(`Server is up on port ${port}`);
})