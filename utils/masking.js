// mascara o CPF
function maskCPF(cpf) {
    return `***.${cpf.slice(3,6)}.${cpf.slice(6,9)}-**`;
}

// mascara o nome, ex: "Carlos Aguiar" → "C. A."
function maskName(name) {
    const partes = name.trim().split(" ");
    const iniciais = partes.map(p => p[0].toUpperCase());
    return iniciais.join(". ") + ".";
}

// cria objeto do paciente
function createPatient(cpf, nome, posicao) {
    return {
        cpf_mascarado: maskCPF(cpf),
        nome_mascarado: maskName(nome),
        posicao
    };
}

module.exports = { maskCPF, maskName, createPatient };