// Stub p/ assets de fonte (.ttf/.otf) em testes: o bundler do Expo resolve esses
// require() em runtime, mas o jest não transforma binários. Retorna um id estável.
module.exports = 1;
