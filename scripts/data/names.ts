export const FIRST_NAMES: Record<string, string[]> = {
  English: [
    'James', 'Oliver', 'Harry', 'Jack', 'George', 'Noah', 'Charlie', 'Thomas', 'William', 'Ethan',
    'Samuel', 'Michael', 'Daniel', 'Matthew', 'Christopher', 'Andrew', 'Ryan', 'Luke', 'Benjamin', 'Nathan',
    'Adam', 'Joshua', 'Lewis', 'Joe', 'Tom', 'Alex', 'Jake', 'Kyle', 'Tyler', 'Jordan',
  ],
  Spanish: [
    'Carlos', 'Alejandro', 'Pablo', 'Sergio', 'Diego', 'Javier', 'Fernando', 'Miguel', 'Luis', 'Andres',
    'Alvaro', 'Marco', 'Juan', 'Pedro', 'Rafael', 'Roberto', 'David', 'Alberto', 'Jorge', 'Ricardo',
    'Victor', 'Ivan', 'Manuel', 'Francisco', 'Ruben', 'Adrian', 'Hugo', 'Oscar', 'Hector', 'Eduardo',
  ],
  Italian: [
    'Marco', 'Alessandro', 'Andrea', 'Luca', 'Matteo', 'Lorenzo', 'Francesco', 'Davide', 'Riccardo', 'Simone',
    'Gabriele', 'Nicolo', 'Emanuele', 'Federico', 'Daniele', 'Stefano', 'Giorgio', 'Paolo', 'Antonio', 'Alberto',
    'Roberto', 'Claudio', 'Vincenzo', 'Cristian', 'Fabio', 'Gianluca', 'Massimo', 'Dario', 'Leonardo', 'Pietro',
  ],
  German: [
    'Lukas', 'Felix', 'Jonas', 'Leon', 'Maximilian', 'Niklas', 'Florian', 'Tobias', 'Moritz', 'Tim',
    'Julian', 'Philipp', 'Sebastian', 'Patrick', 'Christoph', 'Dominik', 'Kevin', 'Thomas', 'Manuel', 'Stefan',
    'Jan', 'Lars', 'Fabian', 'Marc', 'Kai', 'Benjamin', 'David', 'Markus', 'Michael', 'Christian',
  ],
  French: [
    'Antoine', 'Kylian', 'Ousmane', 'Theo', 'Lucas', 'Clement', 'Alexandre', 'Maxime', 'Romain', 'Nicolas',
    'Adrien', 'Florian', 'Julien', 'Kevin', 'Thomas', 'Baptiste', 'Hugo', 'Mathieu', 'Pierre', 'Alexis',
    'Benjamin', 'Sebastien', 'Jonathan', 'Xavier', 'Francois', 'Gael', 'Karim', 'Yoann', 'Steven', 'Loris',
  ],
};

export const LAST_NAMES: Record<string, string[]> = {
  English: [
    'Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor',
    'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Walker', 'Robinson',
    'Lewis', 'Lee', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott', 'Adams', 'Baker',
    'Nelson', 'Hill', 'Ramirez', 'Campbell', 'Mitchell', 'Roberts', 'Carter', 'Phillips', 'Evans', 'Turner',
  ],
  Spanish: [
    'Garcia', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres',
    'Flores', 'Rivera', 'Gomez', 'Diaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Gutierrez', 'Chavez',
    'Ramos', 'Castillo', 'Jimenez', 'Vargas', 'Alvarez', 'Romero', 'Mendoza', 'Herrera', 'Medina', 'Aguilar',
    'Vega', 'Ruiz', 'Castro', 'Soto', 'Nunez', 'Blanco', 'Fuentes', 'Iglesias', 'Navarro', 'Delgado',
  ],
  Italian: [
    'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco',
    'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa', 'Giordano', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti',
    'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone',
    'Longo', 'Gentile', 'Martinelli', 'Vitale', 'Lombardo', 'Serra', 'Coppola', 'De Angelis', 'Ferretti', 'Montanari',
  ],
  German: [
    'Mueller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann',
    'Schaefer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schroeder', 'Neumann', 'Schwarz', 'Zimmermann',
    'Braun', 'Krueger', 'Hartmann', 'Lange', 'Werner', 'Schmitt', 'Krause', 'Maier', 'Lehmann', 'Huber',
    'Walter', 'Peters', 'Kaiser', 'Hahn', 'Brandt', 'Fuchs', 'Roth', 'Sommer', 'Frank', 'Berger',
  ],
  French: [
    'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau',
    'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier',
    'Morel', 'Girard', 'Andre', 'Lefevre', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'Fontaine', 'Rousseau',
    'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas', 'Perrin', 'Morin', 'Mathieu', 'Clement',
  ],
};

export const NATIONALITIES_BY_COUNTRY: Record<string, { primary: string; secondary: string[] }> = {
  EN: { primary: 'English', secondary: ['French', 'Spanish', 'German', 'Italian'] },
  ES: { primary: 'Spanish', secondary: ['French', 'Italian', 'German', 'English'] },
  IT: { primary: 'Italian', secondary: ['French', 'Spanish', 'German', 'English'] },
  DE: { primary: 'German', secondary: ['French', 'English', 'Spanish', 'Italian'] },
  FR: { primary: 'French', secondary: ['Spanish', 'Italian', 'German', 'English'] },
};
